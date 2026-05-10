import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import IconButton from "./IconButton";
import EditableTitleViewer from "./EditableTitleViewer";
import NotificationBellButton from "./NotificationBellButton";
import OpenBoardBadgeButton from "./OpenBoardBadgeButton";
import SharePopover from "./SharePopover";
import { usePageTitle } from "./usePageTitle";
import { useI18n } from "../../i18n/I18nContext";

/**
 * Traycer commentNavigator 顶部 toolbar 1:1 复刻。
 * Legacy UI reference: TRAYCER_UI_TEARDOWN.md section A.
 * Keep the public ClearLoop word-mark out of this compact toolbar.
 *
 * 严禁出现产品 word-mark：
 * 容器里只有 Back/Forward + EditableTitle + 右侧 IconButton 组。
 *
 * className 串严格 verbatim：
 *   "py-1 flex items-center justify-between sticky top-0 border-b border-b-border z-10 gap-1.5"
 *
 * height token: --traycer-toolbar-height: 50px（外层），内部 min-h-[32px]。
 *
 * 路由感知：useLocation()。Editable 仅在 task / epic/chat 路由开启。
 */
export interface NavigationBarProps {
  /** 未读通知数；外部从 store 注入。默认 0。 */
  unreadCount?: number;
  /** 标题保存回调；外部接 backend。默认 no-op。 */
  onSaveTitle?: (next: string) => void;
  /** 通知按钮点击。默认导航到 /notifications。 */
  onNotificationsClick?: () => void;
  /** Open Board 点击（仅 epic/chat）。默认 no-op。 */
  onOpenBoard?: () => void;
}

export function NavigationBar({
  unreadCount = 0,
  onSaveTitle,
  onNotificationsClick,
  onOpenBoard,
}: NavigationBarProps = {}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const title = usePageTitle();
  const { t } = useI18n();

  const isEpicChat = pathname.startsWith("/epic/chat");
  const isEditable = pathname.startsWith("/task") || isEpicChat;

  const handleNotifClick = () => {
    if (onNotificationsClick) {
      onNotificationsClick();
    } else {
      navigate("/notifications");
    }
  };

  return (
    <nav
      className="py-1 flex items-center justify-between sticky top-0 border-b border-b-border z-10 gap-1.5"
      style={{ minHeight: "var(--traycer-toolbar-height, 50px)" }}
    >
      {/* 左 + 中：Back/Forward + 标题 */}
      <div className="flex min-w-0 flex-1 items-center truncate min-h-[32px]">
        <div className="flex items-center gap-x-1">
          <IconButton
            onClick={() => navigate(-1)}
            ariaLabel={t.navGoBack}
            title={t.navGoBack}
            isBordered
            className="p-1!"
          >
            <ChevronLeft width={16} height={16} />
          </IconButton>
          <IconButton
            onClick={() => navigate(1)}
            ariaLabel={t.navGoForward}
            title={t.navGoForward}
            isBordered
            className="p-1!"
          >
            <ChevronRight className="w-4 h-4" />
          </IconButton>
        </div>
        <div className="min-w-0 pl-2 flex flex-col truncate w-full">
          {isEditable ? (
            <EditableTitleViewer
              title={title}
              onSave={(next) => {
                // TODO: 接 backend（task chain rename / epic rename）
                onSaveTitle?.(next);
              }}
              textClassName="font-semibold truncate first-letter:capitalize"
              inputClassName="font-semibold h-auto py-0 px-1 min-w-[200px] w-full"
              placeholder={t.navTitlePlaceholder}
            />
          ) : (
            <div className="font-semibold truncate first-letter:capitalize">
              {title}
            </div>
          )}
        </div>
      </div>

      {/* 右：条件性工具按钮 */}
      <div className="ml-auto flex shrink-0 items-center gap-2 pr-1">
        {isEpicChat && <OpenBoardBadgeButton onClick={onOpenBoard} />}
        {isEpicChat && <SharePopover />}
        <NotificationBellButton
          unreadCount={unreadCount}
          ariaLabel={t.navNotifications}
          title={t.navNotifications}
          onClick={handleNotifClick}
        />
      </div>
    </nav>
  );
}

export default NavigationBar;
