//#region src/utils/placement.ts
const top = {
	align: "center",
	side: "top"
};
const topLeft = {
	align: "start",
	side: "top"
};
const topRight = {
	align: "end",
	side: "top"
};
const bottom = {
	align: "center",
	side: "bottom"
};
const bottomLeft = {
	align: "start",
	side: "bottom"
};
const bottomRight = {
	align: "end",
	side: "bottom"
};
const left = {
	align: "center",
	side: "left"
};
const leftTop = {
	align: "start",
	side: "left"
};
const leftBottom = {
	align: "end",
	side: "left"
};
const right = {
	align: "center",
	side: "right"
};
const rightTop = {
	align: "start",
	side: "right"
};
const rightBottom = {
	align: "end",
	side: "right"
};
/**
* Map of placement values to Base UI placement config
* Used by Popover and DropdownMenu components
*/
const placementMap = {
	bottom,
	bottomCenter: bottom,
	bottomLeft,
	bottomRight,
	left,
	leftBottom,
	leftTop,
	right,
	rightBottom,
	rightTop,
	top,
	topCenter: top,
	topLeft,
	topRight
};
/**
* Convert unified Placement to Floating UI placement format
* Used by Tooltip component which uses @floating-ui/react
*
* @param placement - Unified placement value
* @returns Floating UI placement (e.g., 'top-start', 'bottom-end')
*/
const toFloatingUIPlacement = (placement) => {
	if (!placement) return "top";
	switch (placement) {
		case "topLeft": return "top-start";
		case "top":
		case "topCenter": return "top";
		case "topRight": return "top-end";
		case "bottomLeft": return "bottom-start";
		case "bottom":
		case "bottomCenter": return "bottom";
		case "bottomRight": return "bottom-end";
		case "leftTop": return "left-start";
		case "left": return "left";
		case "leftBottom": return "left-end";
		case "rightTop": return "right-start";
		case "right": return "right";
		case "rightBottom": return "right-end";
		default: return "top";
	}
};

//#endregion
export { placementMap, toFloatingUIPlacement };
//# sourceMappingURL=placement.mjs.map