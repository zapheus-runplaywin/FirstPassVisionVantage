import { COURT } from '@firstpass/engine';
import { colors } from '@firstpass/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

/** Drawing units: the court is 610 by 305, attack to the right. */
export const W = 610;
export const H = 305;
const R = (COURT.circleRadiusM / COURT.lengthM) * W;

/** The whole court, or one attacking third (ours at the right, theirs at the left). */
export type Zoom = 'full' | 'right third' | 'left third';

const VIEW: Record<Zoom, { x: number; w: number }> = {
  full: { x: 0, w: W },
  'right third': { x: W - 204, w: 204 },
  'left third': { x: 0, w: 204 },
};

/**
 * A court in our attacking direction with whatever is drawn on it. Children
 * use drawing units (x 0 to 610, y 0 to 305); `at()` turns a court point
 * into them.
 */
export function CourtDrawing({
  children,
  zoom = 'full',
  label,
  maxHeight,
}: {
  children?: ReactNode;
  zoom?: Zoom;
  label: string;
  maxHeight?: number;
}) {
  const [width, setWidth] = useState(0);
  const v = VIEW[zoom];
  const ratio = v.w / H;
  const height = Math.min(width / ratio, maxHeight ?? Infinity);
  return (
    <View style={{ width: '100%', alignItems: 'center' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={label}>
      {width > 0 ? (
        <Svg width={height * ratio} height={height} viewBox={`${v.x} 0 ${v.w} ${H}`}>
          <Rect x={2} y={2} width={W - 4} height={H - 4} rx={4} fill={colors.court} stroke={colors.courtLine} strokeWidth={2.5} />
          <Path d={`M2 ${H / 2 - R} A${R} ${R} 0 0 1 2 ${H / 2 + R}`} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
          <Path d={`M${W - 2} ${H / 2 - R} A${R} ${R} 0 0 0 ${W - 2} ${H / 2 + R}`} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
          <Line x1={203.3} y1={2} x2={203.3} y2={H - 2} stroke={colors.courtLine} strokeWidth={2.5} />
          <Line x1={406.6} y1={2} x2={406.6} y2={H - 2} stroke={colors.courtLine} strokeWidth={2.5} />
          <Circle cx={W / 2} cy={H / 2} r={9} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
          {zoom === 'full' ? (
            <SvgText x={598} y={26} fill={colors.selected} fontSize={16} fontWeight="700" fontFamily="sans-serif" textAnchor="end">
              our attack →
            </SvgText>
          ) : null}
          {children}
        </Svg>
      ) : (
        <View style={{ width: '100%', aspectRatio: ratio }} />
      )}
    </View>
  );
}

export const at = (p: { x: number; y: number }) => ({ cx: p.x * W, cy: p.y * H });
