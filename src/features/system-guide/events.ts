export const SYSTEM_GUIDE_STEP_EVENT = "apt:system-guide-step";

export type SystemGuideStepEventDetail = {
  selector: string | null;
};

export function announceSystemGuideStep(selector: string | null) {
  document.dispatchEvent(
    new CustomEvent<SystemGuideStepEventDetail>(SYSTEM_GUIDE_STEP_EVENT, {
      detail: { selector },
    }),
  );
}

