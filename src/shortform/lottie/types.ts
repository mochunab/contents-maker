export type LottieOverlayType =
  | 'confetti'
  | 'sparkles'
  | 'fire'
  | 'checkmark'
  | 'heart_pulse'
  | 'star_burst'
  | 'alert'
  | 'lightbulb'
  | 'trophy'
  | 'megaphone'
  ;

export type LottieOverlayPosition = 'center' | 'full' | 'top' | 'bottom';

export type LottieOverlayConfig = {
  type: LottieOverlayType;
  position: LottieOverlayPosition;
  opacity: number;
  scale: number;
};
