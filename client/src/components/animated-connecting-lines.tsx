import React from 'react';

interface AnimatedConnectingLinesProps {
  labels: string[];
  labelPositions: string[];
  targetPositions: string[];
  color?: string;
  pathConfigs?: Array<{
    startX: string;
    startY: string;
    endX: string;
    endY: string;
    controlX: string;
    controlY: string;
  }>;
}

export function AnimatedConnectingLines({
  labels,
  labelPositions,
  targetPositions,
  color = '#3b82f6',
  pathConfigs,
}: AnimatedConnectingLinesProps) {
  // Default path configs if not provided
  const defaultPaths = pathConfigs || labels.map((_, idx) => ({
    startX: labelPositions[idx],
    startY: '0%',
    endX: targetPositions[idx] || labelPositions[idx],
    endY: '100%',
    controlX: `${(parseFloat(labelPositions[idx].replace('%', '')) + parseFloat((targetPositions[idx] || labelPositions[idx]).replace('%', ''))) / 2}%`,
    controlY: '50%',
  }));

  // Generate unique IDs to avoid conflicts
  const uniqueId = React.useMemo(() => Math.random().toString(36).substr(2, 9), []);

  return (
    <div 
      className="absolute left-0 right-0 pointer-events-none"
      style={{ 
        top: '3.5rem', // top-14 equivalent (below labels)
        height: '8rem', // h-32 equivalent (space for lines)
        width: '100%',
        zIndex: 10
      }}
    >
      <svg 
        width="100%" 
        height="100%" 
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ 
          display: 'block',
          overflow: 'visible'
        }}
      >
        {defaultPaths.map((curve, idx) => {
          const pathId = `path-${uniqueId}-${idx}`;
          // Convert percentage strings to numbers for viewBox coordinates (0-100)
          const parsePercent = (val: string) => {
            const num = parseFloat(val.replace('%', ''));
            return isNaN(num) ? 0 : num;
          };
          const startX = parsePercent(curve.startX);
          const startY = parsePercent(curve.startY);
          const endX = parsePercent(curve.endX);
          const endY = parsePercent(curve.endY);
          const controlX = parsePercent(curve.controlX);
          const controlY = parsePercent(curve.controlY);
          
          const pathD = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
          
          // Create multiple dots for each path (flowing animation)
          const dotCount = 8; // Number of dots per path
          
          return (
            <g key={idx}>
              {/* Base path - subtle, professional guide line (invisible but needed for animation) */}
              <path
                id={pathId}
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth="1"
                strokeOpacity="0"
              />
              
              {/* Subtle background path for visual reference */}
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="0.6"
                strokeOpacity="0.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="1 2"
              />
              
              {/* Animated dots flowing along the path - professional data flow visualization */}
              {Array.from({ length: dotCount }).map((_, dotIdx) => {
                const delay = dotIdx * (2.5 / dotCount);
                return (
                  <circle
                    key={dotIdx}
                    r="1"
                    fill={color}
                    opacity="0.8"
                    cx="0"
                    cy="0"
                  >
                    <animateMotion
                      dur="2.5s"
                      repeatCount="indefinite"
                      begin={`${idx * 0.35 + delay}s`}
                      calcMode="linear"
                    >
                      <mpath href={`#${pathId}`} />
                    </animateMotion>
                    <animate
                      attributeName="opacity"
                      values="0;0.9;0.9;0.4;0"
                      dur="2.5s"
                      repeatCount="indefinite"
                      begin={`${idx * 0.35 + delay}s`}
                    />
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

