import React from 'react';

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const TracklistItem = ({ track, progress, isPlaying }) => {
  const { currentTime = 0, duration = 0 } = progress || {};
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{
      padding: '4px 8px',
      backgroundColor: isPlaying ? 'rgba(78, 78, 134, 0.1)' : 'transparent',
      borderRadius: '4px',
      marginBottom: '2px',
    }}>
      {/* Filename + time */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '3px',
      }}>
        <span style={{
          fontSize: '11px',
          color: isPlaying ? '#4e4e86' : 'rgb(1 9 2 / 64%)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '65%',
          fontWeight: isPlaying ? '600' : '400',
        }}>
          {track.filename}
        </span>
        <span style={{
          fontSize: '10px',
          color: '#9CA3AF',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      {/* Timeline bar with playhead dot */}
      <div style={{
        position: 'relative',
        height: '6px',
        backgroundColor: 'rgba(78, 78, 134, 0.12)',
        borderRadius: '3px',
        overflow: 'visible',
      }}>
        {/* Filled portion */}
        <div style={{
          width: `${progressPercent}%`,
          height: '100%',
          backgroundColor: isPlaying ? '#4e4e86' : 'rgba(78, 78, 134, 0.3)',
          borderRadius: '3px',
          transition: 'width 0.15s linear',
        }} />
        {/* Playhead dot */}
        {isPlaying && duration > 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: `${progressPercent}%`,
            transform: 'translate(-50%, -50%)',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#4e4e86',
            border: '2px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        )}
      </div>
    </div>
  );
};

export default TracklistItem;
