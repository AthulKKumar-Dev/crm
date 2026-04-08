import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

export interface GstCalculationInput {
  unitPrice: number;
  quantity: number;
  discount: number;
  gstRate: number; // Full GST percentage (e.g. 18)
}

export interface GstCalculationResult {
  taxableValue: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  totalAmount: number;
}

export interface InvoiceTotals {
  subtotal: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
  totalDiscount: number;
  grandTotal: number;
}

@Injectable()
export class GstCalculatorService {
  /**
   * Determine if a transaction is intra-state (CGST+SGST) or inter-state (IGST)
   */
  isIntraState(sellerStateCode: string, placeOfSupplyCode: string): boolean {
    return sellerStateCode === placeOfSupplyCode;
  }

  /**
   * Calculate GST for a single line item
   *
   * CGST+SGST (intra-state): each is half the rate
   *   e.g. 18% GST → 9% CGST + 9% SGST
   *
   * IGST (inter-state): full rate applied as IGST
   *   e.g. 18% GST → 18% IGST
   */
  calculateLineItem(
    input: GstCalculationInput,
    isIntraState: boolean,
  ): GstCalculationResult {
    const taxableValue = this.round(
      input.unitPrice * input.quantity - input.discount,
    );

    const gstRate = input.gstRate;

    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (isIntraState) {
      // Intra-state: split into CGST + SGST
      cgstRate = this.round(gstRate / 2);
      sgstRate = this.round(gstRate / 2);
      cgstAmount = this.round((taxableValue * cgstRate) / 100);
      sgstAmount = this.round((taxableValue * sgstRate) / 100);
    } else {
      // Inter-state: full rate as IGST
      igstRate = gstRate;
      igstAmount = this.round((taxableValue * igstRate) / 100);
    }

    const totalTax = this.round(cgstAmount + sgstAmount + igstAmount);
    const totalAmount = this.round(taxableValue + totalTax);

    return {
      taxableValue,
      gstRate,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalTax,
      totalAmount,
    };
  }

  /**
   * Calculate invoice totals from an array of line item results
   */
  calculateInvoiceTotals(
    lineItems: GstCalculationResult[],
    totalDiscount: number = 0,
  ): InvoiceTotals {
    const subtotal = this.round(
      lineItems.reduce((sum, item) => sum + item.taxableValue, 0),
    );
    const totalCgst = this.round(
      lineItems.reduce((sum, item) => sum + item.cgstAmount, 0),
    );
    const totalSgst = this.round(
      lineItems.reduce((sum, item) => sum + item.sgstAmount, 0),
    );
    const totalIgst = this.round(
      lineItems.reduce((sum, item) => sum + item.igstAmount, 0),
    );
    const totalTax = this.round(totalCgst + totalSgst + totalIgst);
    const grandTotal = this.round(subtotal + totalTax);

    return {
      subtotal,
      totalCgst,
      totalSgst,
      totalIgst,
      totalTax,
      totalDiscount,
      grandTotal,
    };
  }

  /**
   * Get the Indian financial year for a given date.
   * Financial year runs April 1 through March 31.
   *
   * Examples:
   *   Jan 2025 → "2024-25"
   *   Apr 2025 → "2025-26"
   *   Mar 2026 → "2025-26"
   */
  getFinancialYear(date: Date): string {
    const month = date.getMonth(); // 0-indexed, April = 3
    const year = date.getFullYear();

    if (month >= 3) {
      // April onwards → current year - next year
      return `${year}-${(year + 1).toString().slice(2)}`;
    }
    // Jan-Mar → previous year - current year
    return `${year - 1}-${year.toString().slice(2)}`;
  }

  /**
   * Round to 2 decimal places (standard for currency)
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Convert Prisma Decimal to number for calculations
   */
  toNumber(decimal: Decimal | number | null | undefined): number {
    if (decimal === null || decimal === undefined) return 0;
    if (typeof decimal === 'number') return decimal;
    return parseFloat(decimal.toString());
  }
}
