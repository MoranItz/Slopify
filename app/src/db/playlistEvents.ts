type Listener = () => void;
const playlistListeners = new Set<Listener>();
const libraryListeners = new Set<Listener>();

export const playlistEvents = {
  subscribe(fn: Listener) {
    playlistListeners.add(fn);
    return () => {
      playlistListeners.delete(fn);
    };
  },
  emit() {
    playlistListeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error("Error in playlistEvents listener:", e);
      }
    });
  },
};

export const libraryEvents = {
  subscribe(fn: Listener) {
    libraryListeners.add(fn);
    return () => {
      libraryListeners.delete(fn);
    };
  },
  emit() {
    libraryListeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error("Error in libraryEvents listener:", e);
      }
    });
  },
};
