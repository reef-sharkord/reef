import { LeftSidebar } from '@/components/left-sidebar';
import { ModViewSheet } from '@/components/mod-view-sheet';
import { Protect } from '@/components/protect';
import { Rail } from '@/components/rail';
import { RightSidebar } from '@/components/right-sidebar';
import { ThreadSidebar } from '@/components/thread-sidebar';
import { TopBar } from '@/components/top-bar';
import { VoiceChatSidebar } from '@/components/voice-chat-sidebar';
import { useSelectedDmChannelId, useThreadSidebar } from '@/features/app/hooks';
import { setDmsOpen } from '@/features/server/actions';
import { setSelectedChannelId } from '@/features/server/channels/actions';
import { useDmsOpen, usePublicServerSettings } from '@/features/server/hooks';
import { getLocalStorageItemBool, LocalStorageKey } from '@/helpers/storage';
import { useSwipeGestures } from '@/hooks/use-swipe-gestures';
import { cn } from '@/lib/utils';
import { Permission, TestId } from '@sharkord/shared';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ContentWrapper } from './content-wrapper';
import { PreventBrowser } from './prevent-browser';

const ServerView = memo(() => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileUsersOpen, setIsMobileUsersOpen] = useState(false);
  // Stage 2 of the swipe-right gesture: the server rail. Hidden by default on
  // mobile (always visible on desktop). (handoff: two-stage left→right swipe)
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [isDesktopRightSidebarOpen, setIsDesktopRightSidebarOpen] = useState(
    getLocalStorageItemBool(LocalStorageKey.RIGHT_SIDEBAR_STATE, true)
  );
  const dmsOpen = useDmsOpen();
  const selectedDmChannelId = useSelectedDmChannelId();
  const publicSettings = usePublicServerSettings();
  const previousServerChannelIdRef = useRef<number | undefined>(undefined);
  const { isOpen: isThreadSidebarOpen } = useThreadSidebar();

  const handleDesktopRightSidebarToggle = useCallback(() => {
    setIsDesktopRightSidebarOpen((prev) => !prev);
    localStorage.setItem(
      LocalStorageKey.RIGHT_SIDEBAR_STATE,
      !isDesktopRightSidebarOpen ? 'true' : 'false'
    );
  }, [isDesktopRightSidebarOpen]);

  // Two-stage reveal: closed → channel list → server rail.
  const handleSwipeRight = useCallback(() => {
    if (isMobileUsersOpen) {
      setIsMobileUsersOpen(false);
      return;
    }

    if (!isMobileMenuOpen) {
      setIsMobileMenuOpen(true);
      return;
    }

    setIsRailOpen(true);
  }, [isMobileMenuOpen, isMobileUsersOpen]);

  // Collapse in reverse: rail → channel list → closed (then the users sidebar).
  const handleSwipeLeft = useCallback(() => {
    if (isRailOpen) {
      setIsRailOpen(false);
      return;
    }

    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      return;
    }

    if (isMobileUsersOpen) {
      setIsMobileUsersOpen(false);
      return;
    }

    setIsMobileUsersOpen(true);
  }, [isMobileMenuOpen, isMobileUsersOpen, isRailOpen]);

  const swipeHandlers = useSwipeGestures({
    onSwipeRight: handleSwipeRight,
    onSwipeLeft: handleSwipeLeft
  });

  useEffect(() => {
    if (publicSettings?.directMessagesEnabled === false && dmsOpen) {
      setDmsOpen(false);

      if (previousServerChannelIdRef.current) {
        setSelectedChannelId(previousServerChannelIdRef.current);
      }
    }
  }, [publicSettings?.directMessagesEnabled, dmsOpen]);

  return (
    <div
      data-testid={TestId.SERVER_VIEW}
      className="flex h-full flex-col bg-background text-foreground"
      {...swipeHandlers}
    >
      <TopBar
        onToggleRightSidebar={handleDesktopRightSidebarToggle}
        isOpen={isDesktopRightSidebarOpen}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <PreventBrowser />

        {isMobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {isMobileUsersOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setIsMobileUsersOpen(false)}
          />
        )}

        <LeftSidebar
          className={cn(
            'md:relative md:flex fixed inset-0 left-0 h-full z-40 md:z-0 transition-transform duration-300 ease-in-out',
            isMobileMenuOpen
              ? 'translate-x-0'
              : '-translate-x-full md:translate-x-0'
          )}
        />

        {/* Mobile rail — swipe-right stage 2, hidden on desktop (the rail is
              always visible there via Routing). Slides in over the channel
              drawer's left edge; tap the backdrop or swipe left to dismiss. */}
        {isRailOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-[45]"
            onClick={() => setIsRailOpen(false)}
          />
        )}

        <Rail
          className={cn(
            'md:hidden fixed top-0 bottom-0 left-0 z-50 transition-transform duration-300 ease-in-out',
            isRailOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        />

        <ContentWrapper
          isDmMode={dmsOpen}
          selectedDmChannelId={selectedDmChannelId}
        />

        <VoiceChatSidebar />

        <ThreadSidebar isOpen={isThreadSidebarOpen} />

        <RightSidebar
          className={cn(
            'fixed top-0 bottom-0 right-0 h-full z-40',
            'lg:relative lg:z-0',
            isMobileUsersOpen
              ? 'translate-x-0 lg:translate-x-0'
              : 'translate-x-full lg:translate-x-0'
          )}
          isOpen={isMobileUsersOpen || isDesktopRightSidebarOpen}
        />

        <Protect permission={Permission.MANAGE_USERS}>
          <ModViewSheet />
        </Protect>
      </div>
    </div>
  );
});

export { ServerView };
