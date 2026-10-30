import React from 'react'

/** The Collabo "C" mark, drawn in the current text colour so it follows the theme. */
const CollaboIcon = ({ width = 30, height = 30 }) => {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M19 5.5h-7.5a6.5 6.5 0 0 0 0 13H19" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default CollaboIcon
