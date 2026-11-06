import type {
  CSSProperties,
  ForwardRefExoticComponent,
  RefAttributes,
} from "react";
import type {
  FireText as FireTextInstance,
  FireTextOptions,
  OverlayBlendMode,
} from "./index.js";

export declare const OVERLAY_BLEND_MODES: readonly OverlayBlendMode[];

export interface FireTextReactProps extends FireTextOptions {
  className?: string;
  style?: CSSProperties;
}

export declare const FireTextReact: ForwardRefExoticComponent<
  FireTextReactProps & RefAttributes<FireTextInstance>
>;

export declare function createFireTextComponent(
  ReactInstance?: unknown
): typeof FireTextReact;

export { FireTextReact as FireText };
export default FireTextReact;
