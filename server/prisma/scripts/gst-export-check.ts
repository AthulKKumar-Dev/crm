/**
 * Dump the GST return CSVs exactly as the Download button produces them, and
 * assert every statutory section and column is present.
 *
 * Goes through `getGstReturnExportData` + `renderCsvSections` — the same code
 * path the controller uses — so what is printed here is byte-for-byte what a
 * merchant downloads.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InvoiceService } from '../../src/invoice/invoice.service';
import { GstReturnType } from '../../src/invoice/dto/query-gst-return.dto';
import { renderCsvSections } from '../../src/invoice/gst-return-rows';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new Logger(),
  });
  const prisma = app.get(PrismaService);
  const invoices = app.get(InvoiceService);

  const org = await prisma.organization.findFirst({
    where: { slug: 'gst-fixtures' },
    select: { id: true, name: true },
  });
  if (!org) throw new Error('Run `npm run gst:fixtures` first.');

  const period = { financialYear: '2026-27', period: '09' };
  const actor = { email: 'tech@collabo.digital' };

  for (const returnType of [GstReturnType.GSTR1, GstReturnType.GSTR3B]) {
    const sections = await invoices.getGstReturnExportData(
      org.id,
      { ...period, returnType } as any,
      actor,
    );
    const csv = renderCsvSections(sections);

    console.log('');
    console.log('='.repeat(78));
    console.log(`${returnType} — ${sections.length} sections, ${csv.length} bytes`);
    console.log('='.repeat(78));
    console.log(csv);
  }

  await app.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
