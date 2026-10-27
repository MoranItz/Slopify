import React, { useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "../player/PlayerProvider";
import { colors } from "../theme";

const { width } = Dimensions.get("window");

type Props = {
  onPress?: () => void;
};

export default function MiniPlayer({ onPress }: Props) {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    currentTime,
    duration,
    next,
    previous,
    queueIndex,
  } = usePlayer();

  const canGoPrevious = queueIndex > 0;

  // Fresh refs so PanResponder closure is never stale
  const canGoPreviousRef = useRef(canGoPrevious);
  canGoPreviousRef.current = canGoPrevious;

  const nextRef = useRef(next);
  nextRef.current = next;

  const previousRef = useRef(previous);
  previousRef.current = previous;

  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const slideX = useRef(new Animated.Value(0)).current;
  const isAnimatingRef = useRef(false);
  const touchStartTime = useRef(0);
  const isDraggingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isLeft =
          gestureState.dx < -6 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isRight =
          gestureState.dx > 6 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          canGoPreviousRef.current;
        return isLeft || isRight;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        const isLeft =
          gestureState.dx < -6 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isRight =
          gestureState.dx > 6 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          canGoPreviousRef.current;
        return isLeft || isRight;
      },
      onPanResponderGrant: () => {
        touchStartTime.current = Date.now();
        isDraggingRef.current = false;
        slideX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 6) {
          isDraggingRef.current = true;
        }
        if (!isAnimatingRef.current) {
          if (gestureState.dx > 0 && !canGoPreviousRef.current) {
            // Cannot go back before first track: no sliding right allowed
            slideX.setValue(0);
          } else {
            slideX.setValue(gestureState.dx);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const elapsed = Date.now() - touchStartTime.current;
        const movedDistance = Math.hypot(gestureState.dx, gestureState.dy);

        // TAP DETECTION: If user tapped without dragging, open big player
        if (!isDraggingRef.current && movedDistance < 8 && elapsed < 500) {
          slideX.setValue(0);
          onPressRef.current?.();
          return;
        }

        if (isAnimatingRef.current) return;

        // Slide left -> Next song
        if (gestureState.dx < -45 || gestureState.vx < -0.3) {
          isAnimatingRef.current = true;
          Animated.timing(slideX, {
            toValue: -width * 0.7,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            nextRef.current();
            slideX.setValue(width * 0.7);
            Animated.spring(slideX, {
              toValue: 0,
              damping: 22,
              stiffness: 220,
              useNativeDriver: true,
            }).start(() => {
              isAnimatingRef.current = false;
            });
          });
        }
        // Slide right -> Last / Previous song (ONLY allowed if canGoPreviousRef.current)
        else if (
          (gestureState.dx > 45 || gestureState.vx > 0.3) &&
          canGoPreviousRef.current
        ) {
          isAnimatingRef.current = true;
          Animated.timing(slideX, {
            toValue: width * 0.7,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            previousRef.current();
            slideX.setValue(-width * 0.7);
            Animated.spring(slideX, {
              toValue: 0,
              damping: 22,
              stiffness: 220,
              useNativeDriver: true,
            }).start(() => {
              isAnimatingRef.current = false;
            });
          });
        } else {
          // Snap back smoothly without changing songs
          Animated.spring(slideX, {
            toValue: 0,
            damping: 22,
            stiffness: 220,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (!isAnimatingRef.current) {
          Animated.spring(slideX, {
            toValue: 0,
            damping: 22,
            stiffness: 220,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!currentTrack) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  const slideOpacity = slideX.interpolate({
    inputRange: [-width * 0.5, 0, width * 0.5],
    outputRange: [0.35, 1, 0.35],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.outerContainer}>
      <View style={styles.card} {...panResponder.panHandlers}>
        {/* Progress track along top of the floating pill */}
        <View style={styles.progressBg}>
          <View
            style={[styles.progressFill, { flex: Math.max(progress, 0.001) }]}
          />
          <View style={{ flex: Math.max(1 - progress, 0.001) }} />
        </View>

        <View style={styles.row}>
          <Animated.View
            style={[
              styles.trackInfoWrapper,
              {
                transform: [{ translateX: slideX }],
                opacity: slideOpacity,
              },
            ]}
          >
            {currentTrack.thumbnail ? (
              <Image
                source={{ uri: currentTrack.thumbnail }}
                style={styles.thumb}
              />
            ) : (
              <View style={[styles.thumb, styles.placeholder]} />
            )}

            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {currentTrack.title ?? "(untitled)"}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {currentTrack.artist ?? "Unknown"}
              </Text>
            </View>
          </Animated.View>

          <Pressable
            onPress={togglePlay}
            hitSlop={14}
            style={styles.playButton}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={22}
              color={colors.text}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: colors.bg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.secondaryAccent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  progressBg: {
    height: 3,
    flexDirection: "row",
    backgroundColor: colors.card,
  },
  progressFill: {
    backgroundColor: colors.accent,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackInfoWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: colors.card,
  },
  placeholder: {},
  info: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  artist: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
});
