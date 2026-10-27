export type Track = {
  id: string;
  title: string | null;
  artist: string | null;
  duration: number | null;
  thumbnail: string | null;
  filename?: string;
  filePath?: string | null;
};

export type Playlist = {
  id: string;
  name: string;
  pictureUri: string | null;
  createdAt: number;
  trackCount?: number;
};
