import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "../player/PlayerProvider";
import { colors, formatDuration } from "../theme";

const { width, height } = Dimensions.get("window");
const ART_SIZE = Math.min(width - 72, 320);

type Props = {
  onClose?: () => void;
};

export default function PlayerScreen({ onClose }: Props) {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    next,
    previous,
    seekTo,
    canGoNext,
    canGoPrevious,
  } = usePlayer();

  // Fresh refs so PanResponder closure is never stale
  const canGoPreviousRef = useRef(canGoPrevious);
  canGoPreviousRef.current = canGoPrevious;

  const canGoNextRef = useRef(canGoNext);
  canGoNextRef.current = canGoNext;

  const nextRef = useRef(next);
  nextRef.current = next;

  const previousRef = useRef(previous);
  previousRef.current = previous;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const seekToRef = useRef(seekTo);
  seekToRef.current = seekTo;

  const durationRef = useRef(duration);
  durationRef.current = duration;

  // ── Seek bar interactive scrubbing state ───────────────────
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubRatio, setScrubRatio] = useState(0);
  const [optimisticTime, setOptimisticTime] = useState<number | null>(null);
  const optimisticClearTimeoutRef = useRef<any>(null);
  const isScrubbingRef = useRef(false);
  const seekTrackWidthRef = useRef(1);
  const initialScrubRatioRef = useRef(0);
  const seekYRangeRef = useRef<{ top: number; bottom: number }>({
    top: 0,
    bottom: 0,
  });
  const seekRowRef = useRef<any>(null);

  // Clear optimistic time as soon as native player catches up to sought position
  useEffect(() => {
    if (optimisticTime !== null) {
      if (Math.abs(currentTime - optimisticTime) < 1.0) {
        setOptimisticTime(null);
      }
    }
  }, [currentTime, optimisticTime]);

  const seekPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        if (optimisticClearTimeoutRef.current) {
          clearTimeout(optimisticClearTimeoutRef.current);
        }
        isScrubbingRef.current = true;
        const width = seekTrackWidthRef.current || 1;
        const initialRatio = Math.max(
          0,
          Math.min(1, evt.nativeEvent.locationX / width)
        );
        initialScrubRatioRef.current = initialRatio;
        setScrubRatio(initialRatio);
        setIsScrubbing(true);
      },
      onPanResponderMove: (_, gestureState) => {
        const width = seekTrackWidthRef.current || 1;
        const delta = gestureState.dx / width;
        const newRatio = Math.max(
          0,
          Math.min(1, initialScrubRatioRef.current + delta)
        );
        setScrubRatio(newRatio);
      },
      onPanResponderRelease: (_, gestureState) => {
        const width = seekTrackWidthRef.current || 1;
        const delta = gestureState.dx / width;
        const finalRatio = Math.max(
          0,
          Math.min(1, initialScrubRatioRef.current + delta)
        );
        const targetSeconds = finalRatio * durationRef.current;
        setOptimisticTime(targetSeconds);
        seekToRef.current(targetSeconds);
        setIsScrubbing(false);
        isScrubbingRef.current = false;

        // Fallback safety: hand back control to native currentTime after 600ms
        if (optimisticClearTimeoutRef.current) {
          clearTimeout(optimisticClearTimeoutRef.current);
        }
        optimisticClearTimeoutRef.current = setTimeout(() => {
          setOptimisticTime(null);
        }, 600);
      },
      onPanResponderTerminate: () => {
        setIsScrubbing(false);
        isScrubbingRef.current = false;
      },
    })
  ).current;

  const insets = useSafeAreaInsets();
  const panY = useRef(new Animated.Value(height)).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  const isTrackSwitchingRef = useRef(false);
  const dragAxisRef = useRef<"vertical" | "horizontal" | null>(null);

  // Entrance slide-up animation using smooth decay/spring
  useEffect(() => {
    isClosingRef.current = false;
    Animated.spring(panY, {
      toValue: 0,
      damping: 28,
      stiffness: 280,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [panY]);

  const close = (initialVelocity = 0) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    // Trigger parent close early when sheet crosses bottom of the screen (around 70%)
    let hasNotifiedParent = false;
    const notifyParent = () => {
      if (!hasNotifiedParent) {
        hasNotifiedParent = true;
        onCloseRef.current?.();
      }
    };

    const listenerId = panY.addListener(({ value }) => {
      if (value >= height * 0.7) {
        panY.removeListener(listenerId);
        notifyParent();
      }
    });

    Animated.timing(panY, {
      toValue: height + 60,
      duration: Math.max(140, Math.min(220, 220 - initialVelocity * 40)),
      useNativeDriver: true,
    }).start(() => {
      try {
        panY.removeListener(listenerId);
      } catch {}
      notifyParent();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const touchY = evt.nativeEvent.pageY;
        if (
          isScrubbingRef.current ||
          (touchY >= seekYRangeRef.current.top &&
            touchY <= seekYRangeRef.current.bottom)
        ) {
          return false;
        }
        const isVertical =
          gestureState.dy > 5 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const isHorizontalLeft =
          gestureState.dx < -8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isHorizontalRight =
          gestureState.dx > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          canGoPreviousRef.current;
        return isVertical || isHorizontalLeft || isHorizontalRight;
      },
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        const touchY = evt.nativeEvent.pageY;
        if (
          isScrubbingRef.current ||
          (touchY >= seekYRangeRef.current.top &&
            touchY <= seekYRangeRef.current.bottom)
        ) {
          return false;
        }
        const isVertical =
          gestureState.dy > 5 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const isHorizontalLeft =
          gestureState.dx < -8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isHorizontalRight =
          gestureState.dx > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          canGoPreviousRef.current;
        return isVertical || isHorizontalLeft || isHorizontalRight;
      },
      onPanResponderGrant: () => {
        dragAxisRef.current = null;
        panY.stopAnimation();
        slideX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (!dragAxisRef.current) {
          if (
            Math.abs(gestureState.dy) > 6 ||
            Math.abs(gestureState.dx) > 6
          ) {
            if (Math.abs(gestureState.dy) > Math.abs(gestureState.dx)) {
              dragAxisRef.current = "vertical";
            } else {
              dragAxisRef.current = "horizontal";
            }
          }
        }

        if (dragAxisRef.current === "vertical") {
          if (!isClosingRef.current) {
            panY.setValue(Math.max(0, gestureState.dy));
          }
        } else if (dragAxisRef.current === "horizontal") {
          if (!isTrackSwitchingRef.current) {
            if (gestureState.dx > 0 && !canGoPreviousRef.current) {
              // Cannot go back before first track: no sliding right allowed
              slideX.setValue(0);
            } else if (gestureState.dx < 0 && !canGoNextRef.current) {
              // Cannot go forward past last track: no sliding left allowed
              slideX.setValue(0);
            } else {
              slideX.setValue(gestureState.dx);
            }
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (dragAxisRef.current === "vertical") {
          if (isClosingRef.current) return;

          // Dismiss if dragged down past 80px OR flicked with downward velocity
          if (gestureState.dy > 80 || gestureState.vy > 0.4) {
            close(gestureState.vy);
          } else {
            Animated.spring(panY, {
              toValue: 0,
              damping: 26,
              stiffness: 260,
              mass: 0.8,
              useNativeDriver: true,
            }).start();
          }
        } else if (dragAxisRef.current === "horizontal") {
          if (isTrackSwitchingRef.current) return;

          // Slide left -> Next song
          if (
            (gestureState.dx < -55 || gestureState.vx < -0.35) &&
            canGoNextRef.current
          ) {
            isTrackSwitchingRef.current = true;
            Animated.timing(slideX, {
              toValue: -width * 1.1,
              duration: 160,
              useNativeDriver: true,
            }).start(() => {
              nextRef.current();
              slideX.setValue(width * 1.1);
              Animated.spring(slideX, {
                toValue: 0,
                damping: 24,
                stiffness: 240,
                mass: 0.8,
                useNativeDriver: true,
              }).start(() => {
                isTrackSwitchingRef.current = false;
              });
            });
          }
          // Slide right -> Last / Previous song (ONLY allowed if canGoPreviousRef.current)
          else if (
            (gestureState.dx > 55 || gestureState.vx > 0.35) &&
            canGoPreviousRef.current
          ) {
            isTrackSwitchingRef.current = true;
            Animated.timing(slideX, {
              toValue: width * 1.1,
              duration: 160,
              useNativeDriver: true,
            }).start(() => {
              previousRef.current();
              slideX.setValue(-width * 1.1);
              Animated.spring(slideX, {
                toValue: 0,
                damping: 24,
                stiffness: 240,
                mass: 0.8,
                useNativeDriver: true,
              }).start(() => {
                isTrackSwitchingRef.current = false;
              });
            });
          } else {
            // Snap back smoothly
            Animated.spring(slideX, {
              toValue: 0,
              damping: 24,
              stiffness: 240,
              mass: 0.8,
              useNativeDriver: true,
            }).start();
          }
        } else {
          // Snap back if released with tiny delta
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
        }
        dragAxisRef.current = null;
      },
      onPanResponderTerminate: () => {
        dragAxisRef.current = null;
        if (!isClosingRef.current) {
          Animated.spring(panY, {
            toValue: 0,
            damping: 26,
            stiffness: 260,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        }
        if (!isTrackSwitchingRef.current) {
          Animated.spring(slideX, {
            toValue: 0,
            damping: 24,
            stiffness: 240,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!currentTrack) {
    return (
      <View style={[styles.root, styles.empty]}>
        <Ionicons name="disc-outline" size={64} color={colors.card} />
        <Text style={styles.emptyText}>Nothing playing</Text>
      </View>
    );
  }

  const activeTime = isScrubbing
    ? scrubRatio * duration
    : optimisticTime !== null
    ? optimisticTime
    : currentTime;

  const progress = duration > 0 ? activeTime / duration : 0;

  // Background overlay opacity fades as user pulls down
  const overlayOpacity = panY.interpolate({
    inputRange: [0, height * 0.75],
    outputRange: [0.65, 0],
    extrapolate: "clamp",
  });

  // Track content opacity dims slightly as user slides horizontally
  const slideOpacity = slideX.interpolate({
    inputRange: [-width * 0.75, 0, width * 0.75],
    outputRange: [0.25, 1, 0.25],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.root}>
      {/* Dimmed background backdrop that smoothly fades with drag; tapping it dismisses */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => close(1)}>
        <Animated.View
          style={[styles.backdrop, { opacity: overlayOpacity }]}
        />
      </Pressable>

      {/* Animated sheet responds to downward drag anywhere */}
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 20),
            transform: [
              {
                translateY: panY.interpolate({
                  inputRange: [0, height * 2],
                  outputRange: [0, height * 2],
                  extrapolateLeft: "clamp",
                }),
              },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Grab pill handle at top - tap or pull */}
        <Pressable onPress={() => close(1)} hitSlop={16} style={styles.dragHeader}>
          <View style={styles.grabPill} pointerEvents="none" />
        </Pressable>

        {/* Centered content block */}
        <View style={styles.centerWrapper} pointerEvents="box-none">
          {/* Animated Artwork & Track Info block that slides on horizontal swipe */}
          <Animated.View
            style={[
              styles.trackSlideContainer,
              {
                transform: [{ translateX: slideX }],
                opacity: slideOpacity,
              },
            ]}
            pointerEvents="none"
          >
            {/* Artwork */}
            <View style={styles.artContainer}>
              {currentTrack.thumbnail ? (
                <Image
                  source={{ uri: currentTrack.thumbnail }}
                  style={styles.artwork}
                />
              ) : (
                <View style={[styles.artwork, styles.artworkPlaceholder]}>
                  <Ionicons
                    name="disc-outline"
                    size={80}
                    color={colors.textSecondary}
                  />
                </View>
              )}
            </View>

            {/* Track info */}
            <View style={styles.infoContainer}>
              <Text style={styles.title} numberOfLines={2}>
                {currentTrack.title ?? "(untitled)"}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {currentTrack.artist ?? "Unknown"}
              </Text>
            </View>
          </Animated.View>

          {/* Interactive Seek Bar */}
          <View
            ref={seekRowRef}
            style={styles.seekRow}
            onLayout={() => {
              seekRowRef.current?.measureInWindow(
                (_x: number, y: number, _w: number, h: number) => {
                  if (h > 0) {
                    seekYRangeRef.current = {
                      top: y - 10,
                      bottom: y + h + 10,
                    };
                  }
                }
              );
            }}
          >
            <Text style={styles.time}>{formatDuration(activeTime)}</Text>

            <View
              style={styles.seekTouchArea}
              {...seekPanResponder.panHandlers}
              onLayout={(e) => {
                seekTrackWidthRef.current = e.nativeEvent.layout.width;
              }}
            >
              <View
                style={[
                  styles.seekTrack,
                  isScrubbing && styles.seekTrackActive,
                ]}
              >
                <View
                  style={[
                    styles.seekFill,
                    {
                      flex: Math.max(progress, 0.0001),
                    },
                  ]}
                />
                <View
                  style={[
                    styles.seekThumb,
                    isScrubbing && styles.seekThumbActive,
                  ]}
                />
                <View
                  style={{
                    flex: Math.max(1 - progress, 0.0001),
                  }}
                />
              </View>
            </View>

            <Text style={styles.time}>{formatDuration(duration)}</Text>
          </View>

          {/* Playback Controls */}
          <View style={styles.controls} pointerEvents="box-none">
            <Pressable
              onPress={previous}
              disabled={!canGoPrevious}
              hitSlop={16}
              style={[styles.iconBtn, !canGoPrevious && { opacity: 0.35 }]}
            >
              <Ionicons
                name="play-skip-back"
                size={32}
                color={colors.text}
              />
            </Pressable>

            <Pressable onPress={togglePlay} style={styles.playBtn} hitSlop={16}>
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={36}
                color={colors.text}
              />
            </Pressable>

            <Pressable
              onPress={next}
              disabled={!canGoNext}
              hitSlop={16}
              style={[styles.iconBtn, !canGoNext && { opacity: 0.35 }]}
            >
              <Ionicons
                name="play-skip-forward"
                size={32}
                color={colors.text}
              />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000",
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  dragHeader: {
    width: "100%",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  grabPill: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  centerWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  trackSlideContainer: {
    width: "100%",
    alignItems: "center",
  },
  empty: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 16,
  },
  artContainer: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    marginBottom: 28,
  },
  artwork: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  artworkPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  infoContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  artist: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 6,
    textAlign: "center",
  },
  seekRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 24,
    gap: 8,
  },
  seekTouchArea: {
    flex: 1,
    height: 38,
    justifyContent: "center",
  },
  seekTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  seekTrackActive: {
    height: 6,
    borderRadius: 3,
  },
  seekFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  seekThumb: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFF",
    marginLeft: -5,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  seekThumbActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    backgroundColor: "#FFF",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  time: {
    color: colors.textSecondary,
    fontSize: 12,
    width: 44,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 36,
  },
  iconBtn: {
    padding: 8,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
});
