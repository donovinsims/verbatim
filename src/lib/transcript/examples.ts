export type SampleLink = {
  id: string;
  label: string;
  hint: string;
  url: string;
};

export const SAMPLE_LINKS: SampleLink[] = [
  {
    id: "zoo",
    label: "Me at the Zoo",
    hint: "YouTube",
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  },
  {
    id: "apple-dnd",
    label: "Darknet Diaries · Apple",
    hint: "Carna Botnet",
    url: "https://podcasts.apple.com/us/podcast/carna-botnet/id1296350485?i=1000402428920",
  },
  {
    id: "spotify-dnd",
    label: "Darknet Diaries · Spotify",
    hint: "Carna Botnet",
    url: "https://open.spotify.com/episode/52s3YMuCACqHmFb0EufNgw",
  },
];
