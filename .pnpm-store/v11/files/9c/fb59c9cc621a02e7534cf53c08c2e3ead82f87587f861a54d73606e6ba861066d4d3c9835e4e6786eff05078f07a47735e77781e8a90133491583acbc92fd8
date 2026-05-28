'use client';

import Button_default from "../../../Button/Button.mjs";
import { memo } from "react";
import { jsx } from "react/jsx-runtime";
import { SendHorizontal } from "lucide-react";

//#region src/mobile/ChatInputArea/components/ChatSendButton.tsx
const ChatSendButton = memo(({ ref, loading, onStop, onSend, ...rest }) => {
	return /* @__PURE__ */ jsx(Button_default, {
		icon: SendHorizontal,
		loading,
		ref,
		type: "primary",
		onClick: (e) => {
			e.preventDefault();
			if (loading) onStop?.(e);
			else onSend?.(e);
		},
		...rest
	});
});
ChatSendButton.displayName = "ChatSendButton";
var ChatSendButton_default = ChatSendButton;

//#endregion
export { ChatSendButton_default as default };
//# sourceMappingURL=ChatSendButton.mjs.map