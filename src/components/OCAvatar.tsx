import type { OCParts } from '../types';

const facePaths = [
  'M120 48 C153 48 177 72 177 109 C177 148 153 174 120 174 C87 174 63 148 63 109 C63 72 87 48 120 48 Z',
  'M120 43 C151 43 172 69 172 111 C172 153 151 181 120 181 C89 181 68 153 68 111 C68 69 89 43 120 43 Z',
  'M78 55 Q120 43 162 55 Q177 82 172 137 Q161 171 120 176 Q79 171 68 137 Q63 82 78 55 Z',
  'M120 174 C92 153 65 132 65 94 C65 58 99 43 120 68 C141 43 175 58 175 94 C175 132 148 153 120 174 Z',
];

const backHairPaths = [
  'M62 119 C49 66 77 34 120 34 C164 34 192 70 178 137 L163 158 L153 110 L84 112 L78 158 Z',
  'M55 141 C43 77 73 31 120 31 C171 31 199 78 183 151 C178 174 190 187 171 199 C153 207 151 184 139 193 L91 190 C71 205 57 185 65 168 C52 163 50 151 55 141 Z',
  'M67 118 C54 68 78 37 119 37 C155 37 178 59 176 99 C197 77 218 93 209 119 C203 137 183 140 170 130 L158 111 L82 115 Z',
  'M69 102 C63 59 86 37 120 37 C154 37 177 59 171 102 L154 88 L84 91 Z',
];

const frontHairPaths = [
  'M65 91 C67 52 91 34 122 34 C155 34 176 57 175 91 C153 82 139 66 130 52 C115 74 91 87 65 91 Z',
  'M61 99 C58 55 86 31 121 31 C157 31 182 57 178 99 C156 86 147 67 140 49 C121 77 92 91 61 99 Z',
  'M65 91 C65 52 90 34 121 34 C151 34 172 51 175 80 C150 78 131 63 117 48 C105 70 87 85 65 91 Z',
  'M68 83 C72 49 92 35 121 35 C150 35 168 50 172 79 L158 70 L151 81 L139 65 L126 77 L111 61 L95 77 L82 68 Z',
];

const outfitColors = ['#19201b', '#8fcbd3', '#ffc857', '#ff5c35'];

interface OCAvatarProps {
  parts: OCParts;
  className?: string;
  label?: string;
}

export function OCAvatar({ parts, className = '', label = '自定义 OC 头像' }: OCAvatarProps) {
  const face = Math.abs(parts.face) % facePaths.length;
  const hair = Math.abs(parts.hair) % frontHairPaths.length;
  const color = Math.abs(parts.color) % outfitColors.length;
  const outfit = Math.abs(parts.outfit) % 4;
  const accent = outfitColors[color];

  return (
    <svg
      className={`oc-avatar ${className}`.trim()}
      viewBox="0 0 240 240"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="5" y="5" width="230" height="230" fill="#fff9e9" stroke="#19201b" strokeWidth="2" />
      <path d="M5 190 L235 130 L235 235 L5 235 Z" fill={accent} opacity="0.32" />
      <circle cx="194" cy="42" r="17" fill={accent} stroke="#19201b" strokeWidth="3" />
      <path d={backHairPaths[hair]} fill="#19201b" stroke="#19201b" strokeWidth="4" strokeLinejoin="round" />

      {outfit === 0 && (
        <g stroke="#19201b" strokeWidth="4" strokeLinejoin="round">
          <path d="M48 235 L55 194 Q67 172 99 166 L141 166 Q173 172 185 194 L192 235 Z" fill={accent} />
          <path d="M99 166 L120 194 L141 166 M120 194 L120 235 M73 184 L88 235 M167 184 L152 235" fill="none" />
          <path d="M62 207 L87 207 M153 207 L178 207" fill="none" />
        </g>
      )}
      {outfit === 1 && (
        <g stroke="#19201b" strokeWidth="4" strokeLinejoin="round">
          <path d="M48 235 L55 194 Q67 172 99 166 L141 166 Q173 172 185 194 L192 235 Z" fill="#fff9e9" />
          <path d="M98 166 L120 190 L142 166 L132 160 L108 160 Z" fill={accent} />
          <path d="M120 190 L120 235 M109 202 L131 202" fill="none" />
          <circle cx="120" cy="216" r="3" fill="#19201b" stroke="none" />
        </g>
      )}
      {outfit === 2 && (
        <g stroke="#19201b" strokeWidth="4" strokeLinejoin="round">
          <path d="M48 235 L55 196 Q63 177 91 169 Q83 150 97 139 Q120 123 143 139 Q157 150 149 169 Q177 177 185 196 L192 235 Z" fill={accent} />
          <path d="M91 169 Q120 190 149 169 M105 181 L101 208 M135 181 L139 208 M83 220 Q120 205 157 220" fill="none" />
        </g>
      )}
      {outfit === 3 && (
        <g stroke="#19201b" strokeWidth="4" strokeLinejoin="round">
          <path d="M42 235 L54 190 Q69 171 99 164 L141 164 Q171 171 186 190 L198 235 Z" fill={accent} />
          <path d="M99 164 L117 199 L96 235 M141 164 L123 199 L144 235 M120 199 L120 235" fill="#fff9e9" />
          <path d="M66 192 L88 186 M174 192 L152 186" fill="none" />
        </g>
      )}

      <path d="M105 145 L105 174 Q120 185 135 174 L135 145" fill="#f2c6a0" stroke="#19201b" strokeWidth="4" />
      <path d={facePaths[face]} fill="#f2c6a0" stroke="#19201b" strokeWidth="4" strokeLinejoin="round" />
      <path d={frontHairPaths[hair]} fill="#19201b" stroke="#19201b" strokeWidth="4" strokeLinejoin="round" />
      <path d="M87 108 Q98 101 108 108 M132 108 Q142 101 153 108" fill="none" stroke="#19201b" strokeWidth="4" strokeLinecap="round" />
      <circle cx="99" cy="117" r="4" fill="#19201b" />
      <circle cx="141" cy="117" r="4" fill="#19201b" />
      <path d="M120 119 L115 136 L124 136" fill="none" stroke="#19201b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M105 148 Q120 159 136 146" fill="none" stroke="#19201b" strokeWidth="4" strokeLinecap="round" />
      <path d="M82 136 L94 132 M146 132 L158 136" stroke={accent} strokeWidth="5" strokeLinecap="round" />
      <path d="M18 24 L48 24 M18 24 L18 54 M222 216 L192 216 M222 216 L222 186" fill="none" stroke="#19201b" strokeWidth="2" />
    </svg>
  );
}