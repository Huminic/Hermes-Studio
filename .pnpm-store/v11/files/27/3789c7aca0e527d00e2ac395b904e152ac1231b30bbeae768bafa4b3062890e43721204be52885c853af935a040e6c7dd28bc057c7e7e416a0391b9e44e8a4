'use client';

import DraggablePanel_default from "../../DraggablePanel/index.mjs";
import ChatInputAreaInner_default from "./components/ChatInputAreaInner.mjs";
import { styles } from "./style.mjs";
import { memo } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/chat/ChatInputArea/ChatInputArea.tsx
const ChatInputArea = memo(({ ref, className, style, classNames, expand = true, setExpand, bottomAddons, topAddons, onSizeChange, heights, onSend, ...rest }) => {
	return /* @__PURE__ */ jsx(DraggablePanel_default, {
		className,
		classNames,
		fullscreen: expand,
		headerHeight: heights?.headerHeight,
		maxHeight: heights?.maxHeight,
		minHeight: heights?.minHeight,
		placement: "bottom",
		size: {
			height: heights?.inputHeight,
			width: "100%"
		},
		style: {
			zIndex: 10,
			...style
		},
		onSizeChange,
		children: /* @__PURE__ */ jsxs("section", {
			className: styles.container,
			style: { minHeight: heights?.minHeight },
			children: [
				topAddons,
				/* @__PURE__ */ jsx("div", {
					className: styles.textareaContainer,
					children: /* @__PURE__ */ jsx(ChatInputAreaInner_default, {
						className: styles.textarea,
						ref,
						style: { paddingInline: 16 },
						onSend: () => {
							onSend?.();
							setExpand?.(false);
						},
						...rest
					})
				}),
				bottomAddons
			]
		})
	});
});
var ChatInputArea_default = ChatInputArea;

//#endregion
export { ChatInputArea_default as default };
//# sourceMappingURL=ChatInputArea.mjs.map