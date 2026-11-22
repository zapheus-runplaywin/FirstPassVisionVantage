import { COURT } from '@firstpass/engine';
import type { CourtEnd, CourtPoint } from '@firstpass/schema';
import { colors } from '@firstpass/ui';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const W = 610;
const H = 305;
const R = (COURT.circleRadiusM / COURT.lengthM) * W;

/** The court as the statistician sees it. Taps report fractions of its width and height. */
export function Court({ attackEnd, dot, onTap }: { attackEnd: CourtEnd; dot: CourtPoint | null; onTap: (screen: CourtPoint) => void }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  // Keep the court's 2:1 shape inside whatever space the layout gives it.
  const width = Math.min(box.w, box.h * 2);
  const height = width / 2;
  const right = attackEnd === 'right';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {width > 0 ? (
        <Pressable
          ref={ref}
          accessibilityLabel="Court"
          style={{ width, height }}
          onPress={(e) => {
            // Page coordinates, so the point is right whichever court line was under the finger.
            const { pageX, pageY } = e.nativeEvent;
            ref.current?.measure((_x, _y, w, h, left, top) => {
              const x = (pageX - left) / w;
              const y = (pageY - top) / h;
              if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onTap({ x, y });
            });
          }}
        >
          <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
            <Rect x={2} y={2} width={W - 4} height={H - 4} rx={4} fill={colors.court} stroke={colors.courtLine} strokeWidth={2.5} />
            <Rect x={right ? 406.6 : 2} y={2} width={201.4} height={H - 4} fill="#FFFFFF" opacity={0.08} />
            <Path d={`M2 ${152.5 - R} A${R} ${R} 0 0 1 2 ${152.5 + R}`} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
            <Path d={`M${W - 2} ${152.5 - R} A${R} ${R} 0 0 0 ${W - 2} ${152.5 + R}`} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
            <Line x1={203.3} y1={2} x2={203.3} y2={H - 2} stroke={colors.courtLine} strokeWidth={2.5} />
            <Line x1={406.6} y1={2} x2={406.6} y2={H - 2} stroke={colors.courtLine} strokeWidth={2.5} />
            <Circle cx={305} cy={152.5} r={9} stroke={colors.courtLine} strokeWidth={2.5} fill="none" />
            <Line x1={2} y1={101.7} x2={W - 2} y2={101.7} stroke={colors.courtLine} strokeDasharray="4 8" opacity={0.5} />
            <Line x1={2} y1={203.3} x2={W - 2} y2={203.3} stroke={colors.courtLine} strokeDasharray="4 8" opacity={0.5} />
            <SvgText x={right ? 560 : 50} y={30} fill={colors.selected} fontSize={16} fontWeight="700" textAnchor="middle">
              {right ? 'our attack →' : '← our attack'}
            </SvgText>
            {dot ? (
              <>
                <Circle cx={dot.x * W} cy={dot.y * H} r={13} fill="none" stroke={colors.selected} strokeWidth={3} opacity={0.6} />
                <Circle cx={dot.x * W} cy={dot.y * H} r={7} fill={colors.selected} />
              </>
            ) : null}
          </Svg>
        </Pressable>
      ) : null}
    </View>
  );
}
