import { FlexboxProps } from "../Flex/type.mjs";
import "../Flex/index.mjs";
import { ReactNode, Ref } from "react";

//#region src/SortableList/type.d.ts
interface SortableListItem {
  [key: string]: any;
  id: string | number;
}
interface SortableListProps<T extends SortableListItem = SortableListItem> extends Omit<FlexboxProps, 'onChange'> {
  items: T[];
  onChange: (items: T[]) => void;
  ref?: Ref<HTMLUListElement>;
  renderItem: (item: T) => ReactNode;
}
//#endregion
export { SortableListItem, SortableListProps };
//# sourceMappingURL=type.d.mts.map