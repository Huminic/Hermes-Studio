import { staticStylish } from "../styles/theme/customStylishStatic.mjs";
import { createStaticStyles, cx } from "antd-style";
import { cva } from "class-variance-authority";

//#region src/CodeDiff/style.ts
const prefix = "lobe-code-diff";
const styles = createStaticStyles(({ css: css$1, cssVar: cssVar$1 }) => {
	return {
		actions: css$1`
      position: absolute;
      z-index: 2;
      inset-block-start: 8px;
      inset-inline-end: 8px;

      opacity: 0;
      transition: opacity 0.2s ${cssVar$1.motionEaseInOut};
    `,
		additions: css$1`
      color: ${cssVar$1.colorSuccess};
      font-family: ${cssVar$1.fontFamilyCode};
      font-size: 12px;
    `,
		body: css$1`
      overflow: auto;

      width: 100%;

      font-family: ${cssVar$1.fontFamilyCode};
      font-size: 13px;
      line-height: 1.6;

      /* Override @pierre/diffs shadow DOM CSS variables */
      --pdiff-font-family: ${cssVar$1.fontFamilyCode};
      --pdiff-font-size: 13px;
      --pdiff-line-height: 1.6;
      --pdiff-bg-color: transparent;
      --pdiff-border-color: ${cssVar$1.colorBorderSecondary};
      --pdiff-gutter-bg: ${cssVar$1.colorFillQuaternary};
      --pdiff-gutter-color: ${cssVar$1.colorTextQuaternary};
      --pdiff-added-bg: ${cssVar$1.colorSuccessBgHover};
      --pdiff-added-highlight-bg: ${cssVar$1.colorSuccessBg};
      --pdiff-removed-bg: ${cssVar$1.colorErrorBgHover};
      --pdiff-removed-highlight-bg: ${cssVar$1.colorErrorBg};
      --pdiff-info-bg: ${cssVar$1.colorInfoBg};
    `,
		borderless: staticStylish.variantBorderlessWithoutHover,
		deletions: css$1`
      color: ${cssVar$1.colorError};
      font-family: ${cssVar$1.fontFamilyCode};
      font-size: 12px;
    `,
		filled: cx(staticStylish.variantFilledWithoutHover, css$1`
        background: ${cssVar$1.colorFillQuaternary};
      `),
		header: css$1`
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;

      padding: 8px 12px;

      font-family: ${cssVar$1.fontFamilyCode};
      font-size: 13px;
      color: ${cssVar$1.colorTextSecondary};

      border-block-end: 1px solid ${cssVar$1.colorBorderSecondary};
    `,
		headerBorderless: css$1`
      padding-inline: 0;
      border-block-end: none;
    `,
		headerFilled: css$1`
      background: transparent;
    `,
		headerOutlined: css$1`
      background: ${cssVar$1.colorFillQuaternary};
    `,
		outlined: staticStylish.variantOutlinedWithoutHover,
		root: cx(prefix, css$1`
        position: relative;

        overflow: hidden;

        width: 100%;
        border-radius: ${cssVar$1.borderRadius};

        transition: background-color 100ms ${cssVar$1.motionEaseOut};

        &:hover {
          .${prefix}-actions {
            opacity: 1;
          }
        }
      `),
		stats: css$1`
      display: flex;
      gap: 8px;
      align-items: center;
    `
	};
});
const variants = cva(styles.root, {
	defaultVariants: { variant: "filled" },
	variants: { variant: {
		filled: styles.filled,
		outlined: styles.outlined,
		borderless: styles.borderless
	} }
});
const headerVariants = cva(styles.header, {
	defaultVariants: { variant: "filled" },
	variants: { variant: {
		filled: styles.headerFilled,
		outlined: styles.headerOutlined,
		borderless: styles.headerBorderless
	} }
});

//#endregion
export { headerVariants, prefix, styles, variants };
//# sourceMappingURL=style.mjs.map