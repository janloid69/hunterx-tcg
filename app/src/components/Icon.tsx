import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'binder'
  | 'scan'
  | 'market'
  | 'community'
  | 'search'
  | 'bell'
  | 'plus'
  | 'minus'
  | 'check'
  | 'chevronLeft'
  | 'chevronRight'
  | 'close'
  | 'user'
  | 'chat'
  | 'tag'
  | 'sparkle'
  | 'box'
  | 'logout'
  | 'external';

function shapes(name: IconName) {
  switch (name) {
    case 'home':
      return <Path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />;
    case 'binder':
      return (
        <>
          <Rect x={4} y={3} width={16} height={18} rx={2} />
          <Path d="M9 3v18M13 8h4M13 12h4" />
        </>
      );
    case 'scan':
      return (
        <>
          <Path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
          <Rect x={8.5} y={7} width={7} height={10} rx={1.5} />
        </>
      );
    case 'market':
      return (
        <>
          <Path d="M4 9l1.5-5h13L20 9" />
          <Path d="M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11z" />
          <Path d="M5 13v7h14v-7" />
        </>
      );
    case 'community':
      return (
        <>
          <Circle cx={9} cy={8} r={3.5} />
          <Path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <Path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={7} />
          <Path d="M20 20l-3.5-3.5" />
        </>
      );
    case 'bell':
      return (
        <>
          <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </>
      );
    case 'plus':
      return <Path d="M12 5v14M5 12h14" />;
    case 'minus':
      return <Path d="M5 12h14" />;
    case 'check':
      return <Path d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'chevronLeft':
      return <Path d="M15 18l-6-6 6-6" />;
    case 'chevronRight':
      return <Path d="M9 6l6 6-6 6" />;
    case 'close':
      return <Path d="M6 6l12 12M18 6L6 18" />;
    case 'user':
      return (
        <>
          <Circle cx={12} cy={8} r={4} />
          <Path d="M4 21a8 8 0 0 1 16 0" />
        </>
      );
    case 'chat':
      return <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />;
    case 'tag':
      return (
        <>
          <Path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
          <Circle cx={7.5} cy={7.5} r={1.5} />
        </>
      );
    case 'sparkle':
      return <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />;
    case 'box':
      return (
        <>
          <Path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" />
          <Path d="M3 7.5l9 4.5 9-4.5M12 12v9" />
        </>
      );
    case 'logout':
      return (
        <>
          <Path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <Path d="M10 8l-4 4 4 4M6 12h10" />
        </>
      );
    case 'external':
      return (
        <>
          <Path d="M14 4h6v6M20 4l-9 9" />
          <Path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
        </>
      );
  }
}

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  filled?: boolean;
};

/** Line icons drawn to match the HunterX designs. Decorative by default. */
export function Icon({ name, size = 22, color, strokeWidth = 1.8, filled = false }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <G
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {shapes(name)}
      </G>
    </Svg>
  );
}
