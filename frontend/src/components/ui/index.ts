/**
 * The component library. Import from here — `from "../components/ui"` — never from a
 * file inside the folder, so files can move without breaking pages. Catalogue and
 * conventions: README.md next to this file.
 */

// Foundations
export { Icon, ICON_NAMES, type IconName, type IconProps } from "./Icon";
export {
  Button,
  ButtonLink,
  IconButton,
  buttonClassName,
  type ButtonProps,
  type ButtonLinkProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
} from "./Button";
export { Card, CardHeader, Panel, type CardProps, type CardHeaderProps } from "./Card";
export { Badge, type BadgeProps, type BadgeTone } from "./Badge";
export { StatusPill, StagePill, Tags, type TagsProps } from "./Pills";
export { Avatar, AvatarGroup, avatarHue, type AvatarProps, type AvatarGroupProps, type AvatarSize } from "./Avatar";
export { Kbd, Shortcut } from "./Kbd";

// Feedback
export {
  Notice,
  ErrorNotice,
  RULE_COPY,
  describeError,
  type NoticeProps,
  type NoticeTone,
  type DescribedError,
} from "./Notice";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { Spinner, PageLoader, type SpinnerProps } from "./Spinner";
export {
  Skeleton,
  SkeletonText,
  SkeletonRows,
  SkeletonTable,
  PageSkeleton,
  type SkeletonProps,
} from "./Skeleton";
export { ProgressBar, type ProgressBarProps } from "./ProgressBar";
export { ToastProvider, useToast, type ToastApi, type ToastOptions, type PromiseMessages } from "./Toast";
export { ErrorBoundary, ErrorFallback, type ErrorBoundaryProps } from "./ErrorBoundary";

// Forms
export { Field, useFieldControl, type FieldProps } from "./Field";
export { Input, type InputProps } from "./Input";
export { Textarea, type TextareaProps } from "./Textarea";
export { Select, type SelectProps, type SelectOption } from "./Select";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { Switch, type SwitchProps } from "./Switch";
export { SearchInput, type SearchInputProps } from "./SearchInput";
export { TagInput, type TagInputProps } from "./TagInput";

// Navigation and structure
export { PageHeader, type PageHeaderProps } from "./PageHeader";
export { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";
export { Tabs, TabPanel, type TabItem, type TabsProps, type TabPanelProps } from "./Tabs";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from "./SegmentedControl";
export { Pagination, pageItems, type PaginationProps } from "./Pagination";

// Overlays
export { Modal, type ModalProps } from "./Modal";
export { Drawer, type DrawerProps } from "./Drawer";
export {
  ConfirmDialog,
  ConfirmProvider,
  useConfirm,
  type ConfirmDialogProps,
  type ConfirmOptions,
} from "./ConfirmDialog";
export {
  DropdownMenu,
  type DropdownMenuProps,
  type MenuEntry,
  type MenuTriggerProps,
} from "./DropdownMenu";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { useOverlay, focusableWithin, type OverlayOptions } from "./useOverlay";
export { rovingIndex, focusItem, type Orientation } from "./roving";

// Data display
export {
  DataTable,
  compareValues,
  sortRows,
  type Column,
  type DataTableProps,
  type SortDirection,
  type SortState,
} from "./DataTable";
export { KpiCard, Stat, type KpiCardProps, type KpiDelta } from "./KpiCard";
export { ScoreRing, scoreBand, type ScoreBand, type ScoreRingProps } from "./ScoreRing";
export { StageStepper, stoppedAt, type StageStepperProps } from "./StageStepper";
export { Timeline, type TimelineItem, type TimelineProps } from "./Timeline";
export { CopyButton, type CopyButtonProps } from "./CopyButton";

// Formatting and matching helpers, re-exported so pages need one import.
export {
  formatDate,
  formatDateTime,
  formatRelative,
  formatPercent,
  formatNumber,
  formatYears,
  greeting,
  humanize,
  pluralize,
  initials,
} from "../../lib/format";
export { skillMatch, eligibility, type SkillMatch, type Eligibility } from "../../lib/match";
export { cx } from "../../lib/cx";
