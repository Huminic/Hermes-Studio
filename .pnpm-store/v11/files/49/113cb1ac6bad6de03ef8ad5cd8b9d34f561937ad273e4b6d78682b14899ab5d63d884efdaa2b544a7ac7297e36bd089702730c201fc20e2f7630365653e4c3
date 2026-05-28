import { createStaticStyles } from "antd-style";

//#region src/Menu/sharedStyle.ts
const styles = createStaticStyles(({ css: css$1, cssVar: cssVar$1 }) => ({
	danger: css$1`
    color: ${cssVar$1.colorError} !important;

    &:hover {
      background: ${cssVar$1.colorErrorBg} !important;
    }
  `,
	empty: css$1`
    cursor: default;
    font-style: italic;
    color: ${cssVar$1.colorTextTertiary};
  `,
	extra: css$1`
    margin-inline-start: auto;
    padding-inline-start: 16px;
    font-size: 12px;
    color: ${cssVar$1.colorTextTertiary};
  `,
	groupLabel: css$1`
    user-select: none;

    padding-block: 8px 4px;
    padding-inline: 12px;

    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    color: ${cssVar$1.colorTextTertiary};
    text-transform: capitalize;
  `,
	icon: css$1`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 16px;
    height: 16px;
    margin-inline-end: 8px;
  `,
	item: css$1`
    cursor: pointer;
    user-select: none;

    position: relative;

    overflow: hidden;
    display: flex;
    align-items: center;

    width: 100%;
    min-height: 36px;
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: ${cssVar$1.borderRadiusSM};

    font-size: 14px;
    line-height: 20px;
    color: ${cssVar$1.colorText};

    outline: none;

    transition: all 150ms ${cssVar$1.motionEaseOut};

    &:hover {
      background: ${cssVar$1.colorFillTertiary};
    }

    &:active {
      background: ${cssVar$1.colorFillSecondary};
    }

    &[data-disabled] {
      cursor: not-allowed;
      color: ${cssVar$1.colorTextDisabled};
      opacity: 0.5;

      &:hover {
        background: transparent;
      }
    }

    &[data-highlighted]:not([data-disabled]) {
      background: ${cssVar$1.colorFillTertiary};
    }

    &[data-state='open']:not([data-disabled]),
    &[data-open]:not([data-disabled]),
    &[aria-expanded='true']:not([data-disabled]) {
      background: ${cssVar$1.colorFillTertiary};
    }
  `,
	itemContent: css$1`
    display: flex;
    flex: 1;
    gap: 0;
    align-items: center;
  `,
	itemContentAlignStart: css$1`
    align-items: flex-start;
  `,
	iconAlignStart: css$1`
    align-self: flex-start;
    margin-block-start: 2px;
  `,
	label: css$1`
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;

    & a,
    & a:visited,
    & a:hover,
    & a:active {
      color: inherit;
    }
  `,
	labelGroup: css$1`
    overflow: hidden;
    display: flex;
    flex: 1;
    flex-direction: column;

    min-width: 0;
  `,
	desc: css$1`
    overflow: hidden;

    font-size: 12px;
    line-height: 16px;
    color: ${cssVar$1.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
	popup: css$1`
    min-width: 120px;
    padding: 4px;
    border-radius: ${cssVar$1.borderRadius};

    background: ${cssVar$1.colorBgElevated};
    outline: none;
    box-shadow:
      0 0 15px 0 #00000008,
      0 2px 30px 0 #00000014,
      0 0 0 1px ${cssVar$1.colorBorder} inset;
  `,
	positioner: css$1`
    --lobe-dropdown-animation-duration: 140ms;
    --lobe-dropdown-animation-scale-y: 0.92;
    --lobe-dropdown-animation-ease-in: ease-in;
    --lobe-dropdown-animation-ease-out: ${cssVar$1.motionEaseOut};

    z-index: 1100;

    & > * {
      will-change: opacity, transform;
      transform-origin: var(--transform-origin);
      animation: none;
    }

    &[data-open] > * {
      transform: scaleY(1);
      opacity: 1;
      transition:
        opacity var(--lobe-dropdown-animation-duration) var(--lobe-dropdown-animation-ease-out),
        transform var(--lobe-dropdown-animation-duration) var(--lobe-dropdown-animation-ease-out);
    }

    &[data-open] > *[data-starting-style] {
      transform: scaleY(var(--lobe-dropdown-animation-scale-y));
      opacity: 0;
    }

    &[data-closed] > * {
      transform: scaleY(var(--lobe-dropdown-animation-scale-y));
      opacity: 0;
      transition:
        opacity var(--lobe-dropdown-animation-duration) var(--lobe-dropdown-animation-ease-in),
        transform var(--lobe-dropdown-animation-duration) var(--lobe-dropdown-animation-ease-in);
    }

    &[data-hover-trigger] {
      --lobe-dropdown-animation-duration: 140ms;
    }

    &[data-submenu],
    &[data-nested] {
      --lobe-dropdown-animation-duration: 0ms;
      --lobe-dropdown-animation-scale-y: 1;
    }
  `,
	separator: css$1`
    height: 1px;
    margin-block: 4px;
    margin-inline: 0;
    background: ${cssVar$1.colorBorder};
  `,
	submenuArrow: css$1`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 20px;
    height: 20px;
    margin-inline-start: auto;
    padding-inline-start: 8px;
  `
}));

//#endregion
export { styles };
//# sourceMappingURL=sharedStyle.mjs.map