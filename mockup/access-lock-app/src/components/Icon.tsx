import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'chevronLeft'
  | 'chevronRight'
  | 'bluetooth'
  | 'lock'
  | 'shield'
  | 'shieldSlash'
  | 'clock'
  | 'checkCircle'
  | 'alertTriangle'
  | 'xCircle'
  | 'helpCircle'
  | 'listCheck'
  | 'activity'
  | 'user'
  | 'userSlash'
  | 'plugSlash'
  | 'server'
  | 'reset'
  | 'shieldFriends'
  | 'fingerprint';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

/**
 * Centralized inline-stroke icon set — matches the canvas 1:1.
 * Generic geometric glyphs only (no brand marks), 24x24 viewBox.
 */
export function Icon({ name, size = 24, color = '#122A4E', strokeWidth = 1.75 }: Props) {
  const common = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'chevronLeft' && <Path d="M15 18l-6-6 6-6" {...common} />}
      {name === 'chevronRight' && <Path d="M9 6l6 6-6 6" {...common} />}

      {name === 'bluetooth' && <Path d="M6.5 6.5l11 11L12 22V2l5.5 4.5-11 11" {...common} />}

      {name === 'lock' && (
        <>
          <Rect x="4" y="10" width="16" height="10" rx="2" {...common} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3" {...common} />
        </>
      )}

      {name === 'shield' && (
        <Path d="M12 3l7 3.5v5c0 4.5-3 7.7-7 8.9-4-1.2-7-4.4-7-8.9v-5L12 3Z" {...common} />
      )}

      {name === 'shieldSlash' && (
        <>
          <Path d="M12 3l7 3.5v5c0 4.5-3 7.7-7 8.9-4-1.2-7-4.4-7-8.9v-5L12 3Z" {...common} />
          <Path d="M9 9l6 6M15 9l-6 6" {...common} />
        </>
      )}

      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M12 7v5l3.5 2" {...common} />
        </>
      )}

      {name === 'checkCircle' && <Path d="M20 6 9 17l-5-5" {...common} strokeWidth={strokeWidth + 0.4} />}

      {name === 'alertTriangle' && (
        <>
          <Path d="M12 9v4" {...common} />
          <Path d="M12 17h.01" {...common} />
          <Path
            d="M10.3 3.9 2.6 17.5A1.8 1.8 0 0 0 4.2 20h15.6a1.8 1.8 0 0 0 1.6-2.5L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z"
            {...common}
          />
        </>
      )}

      {name === 'xCircle' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M15 9l-6 6M9 9l6 6" {...common} />
        </>
      )}

      {name === 'helpCircle' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M9.2 9.3a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 1.8-2.6 3.5" {...common} />
          <Path d="M12 17.2v.1" {...common} />
        </>
      )}

      {name === 'listCheck' && (
        <>
          <Rect x="4" y="3" width="16" height="18" rx="2" {...common} />
          <Path d="M9 12l2 2 4-4" {...common} />
        </>
      )}

      {name === 'activity' && <Path d="M3 12h4l2 6 4-14 2 8h6" {...common} />}

      {name === 'user' && (
        <>
          <Circle cx="12" cy="8" r="3.4" {...common} />
          <Path d="M5 20c1.2-3.4 4-5 8-5s6.8 1.6 8 5" {...common} />
        </>
      )}

      {name === 'userSlash' && (
        <>
          <Circle cx="12" cy="8" r="3.4" {...common} />
          <Path d="M5 20c1.3-3.8 4.3-5.6 7-5.6s5.7 1.8 7 5.6" {...common} />
          <Path d="M4 4l16 16" {...common} />
        </>
      )}

      {name === 'plugSlash' && (
        <>
          <Path d="M6.5 6.5l11 11L12 22V2l5.5 4.5-11 11" {...common} />
          <Path d="M3 3l18 18" {...common} />
        </>
      )}

      {name === 'server' && (
        <>
          <Rect x="4" y="4" width="16" height="6" rx="1.5" {...common} />
          <Rect x="4" y="14" width="16" height="6" rx="1.5" {...common} />
          <Path d="M8 7h.01M8 17h.01" {...common} />
        </>
      )}

      {name === 'reset' && (
        <>
          <Path d="M4 12a8 8 0 0 1 14-5.3L21 9" {...common} />
          <Path d="M21 4v5h-5" {...common} />
          <Path d="M20 12a8 8 0 0 1-14 5.3L3 15" {...common} />
          <Path d="M3 20v-5h5" {...common} />
        </>
      )}

      {name === 'shieldFriends' && (
        <>
          <Path d="M16 11a4 4 0 1 0-8 0" {...common} />
          <Path d="M4 20c1.2-3.4 4-5 8-5s6.8 1.6 8 5" {...common} />
        </>
      )}

      {name === 'fingerprint' && (
        <>
          <Path d="M12 3a6 6 0 0 0-6 6v1a17 17 0 0 1-2.5 9" {...common} />
          <Path d="M12 3a6 6 0 0 1 6 6v2c0 1 0 2-.3 3.2" {...common} />
          <Path d="M8 21a13 13 0 0 0 1.5-5.5" {...common} />
          <Path d="M12 21a20 20 0 0 0 1-6v-2a1 1 0 0 0-2 0" {...common} />
          <Path d="M16 21a26 26 0 0 0 .7-4" {...common} />
          <Path d="M4.5 12.5a7.5 7.5 0 0 1 15 0" {...common} />
        </>
      )}
    </Svg>
  );
}
