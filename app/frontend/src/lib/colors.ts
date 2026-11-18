import type { Color } from '../api/types'

/** Swatch colours for project/label dots (decorative: always shown next to a text name). */
export const COLOR_HEX: Record<Color, string> = {
  red: '#d1453b',
  orange: '#eb8909',
  yellow: '#e8b400',
  olive: '#afb83b',
  green: '#299438',
  teal: '#158fad',
  sky: '#14aaf5',
  blue: '#4073ff',
  indigo: '#5b5bd6',
  violet: '#af38eb',
  magenta: '#e05194',
  grey: '#8f8f8f',
}

export const COLOR_NAMES: Record<Color, string> = {
  red: 'Đỏ',
  orange: 'Cam',
  yellow: 'Vàng',
  olive: 'Ô liu',
  green: 'Xanh lá',
  teal: 'Xanh két',
  sky: 'Xanh trời',
  blue: 'Xanh dương',
  indigo: 'Chàm',
  violet: 'Tím',
  magenta: 'Hồng',
  grey: 'Xám',
}
