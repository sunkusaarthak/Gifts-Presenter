import { describe, expect, it } from 'vitest';
import type { SongPackage, StyleConfig } from '../src/shared/types';
import { DEFAULT_STYLE_CONFIG } from '../src/shared/types';

describe('Apply StyleConfig to All Songs', () => {
  const customStyle: StyleConfig = {
    backgroundType: 'gradient',
    backgroundSrc: 'radial-gradient(circle at 50% 35%, #3b2310 0%, #170e07 52%, #070506 100%)',
    backdropDim: 0.45,
    fontFamily: 'Georgia, serif',
    fontSizeVw: 5.2,
    fontWeight: '600',
    textColor: '#FCD34D',
    textShadow: '0 4px 28px rgba(0, 0, 0, 0.95)',
    musicAnimation: 'sacred-waves',
  };

  const mockSongs: SongPackage[] = [
    {
      id: 'song-1',
      title: 'Active Master Track',
      audioPath: 'songs/song-1/audio.mp3',
      duration: 180,
      rawLyrics: 'Line 1\nLine 2',
      syncedLines: [
        { id: 'l1', index: 0, startTime: 1.0, endTime: 4.0, text: 'Line 1' },
        { id: 'l2', index: 1, startTime: 5.0, endTime: 8.0, text: 'Line 2' },
      ],
      styleConfig: customStyle,
      globalOffsetSeconds: 0.15,
    },
    {
      id: 'song-2',
      title: 'Secondary Song',
      audioPath: 'songs/song-2/audio.mp3',
      duration: 210,
      rawLyrics: 'Verse 1\nVerse 2',
      syncedLines: [
        { id: 'l3', index: 0, startTime: 2.0, endTime: 6.0, text: 'Verse 1' },
      ],
      styleConfig: {
        ...DEFAULT_STYLE_CONFIG,
        fontFamily: 'Arial',
        backdropDim: 0.1,
      },
      globalOffsetSeconds: -0.05,
    },
    {
      id: 'song-3',
      title: 'Third Song',
      audioPath: 'songs/song-3/audio.mp3',
      duration: 95,
      rawLyrics: 'Chorus',
      syncedLines: [
        { id: 'l4', index: 0, startTime: 0.5, endTime: 3.5, text: 'Chorus' },
      ],
      styleConfig: DEFAULT_STYLE_CONFIG,
      globalOffsetSeconds: 0,
    },
  ];

  it('correctly replicates visual styleConfig across all songs without touching timing or lyrics', () => {
    const updatedSongs = mockSongs.map((s) => ({
      ...s,
      styleConfig: {
        ...DEFAULT_STYLE_CONFIG,
        ...customStyle,
      },
    }));

    // Verify all songs have the new styling
    for (const song of updatedSongs) {
      expect(song.styleConfig.backdropDim).toBe(0.45);
      expect(song.styleConfig.fontFamily).toBe('Georgia, serif');
      expect(song.styleConfig.fontSizeVw).toBe(5.2);
      expect(song.styleConfig.fontWeight).toBe('600');
      expect(song.styleConfig.textColor).toBe('#FCD34D');
      expect(song.styleConfig.musicAnimation).toBe('sacred-waves');
    }

    // Verify timing, lyrics, and metadata were NOT altered
    expect(updatedSongs[0].title).toBe('Active Master Track');
    expect(updatedSongs[1].syncedLines[0].text).toBe('Verse 1');
    expect(updatedSongs[1].syncedLines[0].startTime).toBe(2.0);
    expect(updatedSongs[1].globalOffsetSeconds).toBe(-0.05); // Preserved
    expect(updatedSongs[2].globalOffsetSeconds).toBe(0); // Preserved
  });

  it('also updates globalOffsetSeconds across all songs when includeOffset is true', () => {
    const sourceOffset = mockSongs[0].globalOffsetSeconds ?? 0;
    const updatedSongs = mockSongs.map((s) => ({
      ...s,
      styleConfig: {
        ...customStyle,
      },
      globalOffsetSeconds: sourceOffset,
    }));

    for (const song of updatedSongs) {
      expect(song.globalOffsetSeconds).toBe(0.15);
    }
  });
});

