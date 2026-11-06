import FireTextDefault, {
  FireText,
  createFireText,
  DEFAULT_OPTIONS,
  OVERLAY_BLEND_MODES,
  type FireTextOptions,
  type RendererChangeInfo,
  type RendererName,
  type RequestedRenderer,
} from "fire-effect-text";
import FireTextVanilla from "fire-effect-text/vanilla";
import FireTextReact, {
  FireTextReact as NamedReact,
  createFireTextComponent,
  type FireTextReactProps,
} from "fire-effect-text/react";

const options: FireTextOptions = {
  text: "FIRE",
  renderer: "auto",
  fallback: true,
  onRendererChange: (info: RendererChangeInfo) => {
    const name: RendererName | undefined = info.renderer;
    return name;
  },
  onError: (error: Error) => error.message,
};

const requested: RequestedRenderer = options.renderer ?? "auto";
void requested;

const instance = new FireText(document.createElement("canvas"), options);
const ready: Promise<FireText> = instance.ready;
const created = createFireText(document.createElement("canvas"), options);
const vanilla = new FireTextVanilla(document.createElement("canvas"), options);

void ready;
void created;
void vanilla;
void FireTextDefault;
void DEFAULT_OPTIONS;
void OVERLAY_BLEND_MODES;

const props: FireTextReactProps = { text: "FIRE", renderer: "webgl2" };
void props;
void FireTextReact;
void NamedReact;
void createFireTextComponent;
