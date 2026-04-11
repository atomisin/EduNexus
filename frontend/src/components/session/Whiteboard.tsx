import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Pencil, Eraser, Highlighter, Type, Square, Circle,
  Minus, Undo, Redo, Trash2, Download, MousePointer
} from 'lucide-react';
import type { Tool, DrawEvent, WhiteboardState } from './types';

interface WhiteboardProps {
  room?: any;
  isTeacher?: boolean;
  visible?: boolean;
}

const COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'
];

const PEN_SIZES = [2, 4, 6, 8];

export const Whiteboard: React.FC<WhiteboardProps> = ({ room, isTeacher = false, visible = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [penSize, setPenSize] = useState(4);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showToolbar, setShowToolbar] = useState(true);
  const [backgroundType, setBackgroundType] = useState<'white' | 'grid' | 'dots'>('white');
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const getContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  const saveState = useCallback(() => {
    const ctx = getContext();
    if (!ctx || ctx.canvas.width === 0 || ctx.canvas.height === 0) return;
    try {
      const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(imageData);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    } catch (e) {
      console.warn('Failed to save whiteboard state:', e);
    }
  }, [getContext, history, historyIndex]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    if (width > 0 && height > 0) {
      canvas.width = width;
      canvas.height = height;

      // Use clearRect instead of fillRect to support CSS backgrounds
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // If we have history, restore it
      if (historyIndex >= 0 && history[historyIndex]) {
        ctx.putImageData(history[historyIndex], 0, 0);
      } else {
        saveState();
      }
    }
  }, [saveState, history, historyIndex]);

  useEffect(() => {
    initCanvas();
    window.addEventListener('resize', initCanvas);
    return () => window.removeEventListener('resize', initCanvas);
  }, [initCanvas, visible]);

  const getPoint = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isTeacher && tool !== 'pen' && tool !== 'highlighter') return;
    setIsDrawing(true);
    lastPoint.current = getPoint(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPoint.current) return;

    const ctx = getContext();
    if (!ctx) return;

    const currentPoint = getPoint(e);

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = penSize * 3;
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color + '60';
      ctx.lineWidth = penSize * 2;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = penSize;
    }

    ctx.stroke();
    lastPoint.current = currentPoint;

    if (room) {
      const drawEvent: DrawEvent = {
        type: 'draw',
        tool,
        color: tool === 'eraser' ? '#ffffff' : (tool === 'highlighter' ? color + '60' : color),
        size: tool === 'eraser' ? penSize * 3 : penSize,
        from: lastPoint.current,
        to: currentPoint
      };
      const encoder = new TextEncoder();
      room.localParticipant.publishData(encoder.encode(JSON.stringify({ type: 'WHITEBOARD_DRAW', data: drawEvent })), { reliable: true });
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPoint.current = null;
    saveState();
  };

  const clearBoard = () => {
    const ctx = getContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    saveState();

    if (room) {
      const encoder = new TextEncoder();
      room.localParticipant.publishData(encoder.encode(JSON.stringify({ type: 'WHITEBOARD_CLEAR' })), { reliable: true });
    }
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const ctx = getContext();
    if (!ctx) return;
    const newIndex = historyIndex - 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const ctx = getContext();
    if (!ctx) return;
    const newIndex = historyIndex + 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  };

  const saveAsImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  useEffect(() => {
    if (!room) return;

    const handleData = (payload: Uint8Array) => {
      const decoder = new TextDecoder();
      const data = JSON.parse(decoder.decode(payload));

      if (data.type === 'WHITEBOARD_DRAW') {
        const ctx = getContext();
        if (!ctx) return;
        const drawData = data.data as DrawEvent;

        ctx.beginPath();
        ctx.moveTo(drawData.from.x, drawData.from.y);
        ctx.lineTo(drawData.to.x, drawData.to.y);
        ctx.globalCompositeOperation = drawData.tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = drawData.color;
        ctx.lineWidth = drawData.size;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (data.type === 'WHITEBOARD_CLEAR') {
        const ctx = getContext();
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      } else if (data.type === 'WHITEBOARD_REQUEST_STATE') {
        if (isTeacher) {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const state: WhiteboardState = {
            imageData: canvas.toDataURL(),
            tool,
            color,
            penSize,
            backgroundType
          };
          const encoder = new TextEncoder();
          room.localParticipant.publishData(
            encoder.encode(JSON.stringify({ type: 'WHITEBOARD_STATE', state })),
            { reliable: true }
          );
        }
      } else if (data.type === 'WHITEBOARD_STATE') {
        const state = data.state as WhiteboardState;
        const ctx = getContext();
        if (!ctx || !state.imageData) return;

        // Restore background type if synced
        if (state.backgroundType && (state.backgroundType === 'white' || state.backgroundType === 'grid' || state.backgroundType === 'dots')) {
          setBackgroundType(state.backgroundType);
        }

        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.drawImage(img, 0, 0);
          saveState();
        };
        img.src = state.imageData;
      }
    };

    room.on('dataReceived', handleData);
    return () => {
      room.off('dataReceived', handleData);
    };
  }, [room, getContext]);

  const requestState = useCallback(() => {
    if (!room || isTeacher) return;
    const encoder = new TextEncoder();
    room.localParticipant.publishData(encoder.encode(JSON.stringify({ type: 'WHITEBOARD_REQUEST_STATE' })), { reliable: true });
  }, [room, isTeacher]);

  useEffect(() => {
    if (visible && room && !isTeacher) {
      // Small delay to ensure room is fully ready
      const timer = setTimeout(requestState, 1000);
      return () => clearTimeout(timer);
    }
  }, [visible, room, isTeacher, requestState]);

  // Don't unmount when hidden - just hide visually to preserve state
  if (!visible) {
    return (
      <div className="h-full w-full hidden">
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  const getBackgroundStyle = () => {
    switch (backgroundType) {
      case 'grid':
        return {
          backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundColor: '#ffffff'
        };
      case 'dots':
        return {
          backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundColor: '#ffffff'
        };
      default:
        return { backgroundColor: '#ffffff' };
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg overflow-hidden border border-slate-200 shadow-inner">
      {showToolbar && (
        <div className="flex items-center gap-2 p-2 bg-slate-100 border-b flex-wrap">
          <div className="flex items-center gap-1 pr-2 border-r">
            <Button
              variant={tool === 'pen' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTool('pen')}
              disabled={!isTeacher}
              title="Pen"
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant={tool === 'highlighter' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTool('highlighter')}
              disabled={!isTeacher}
              title="Highlighter"
            >
              <Highlighter className="w-4 h-4" />
            </Button>
            <Button
              variant={tool === 'eraser' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTool('eraser')}
              disabled={!isTeacher}
              title="Eraser"
            >
              <Eraser className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1 pr-2 border-r">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-blue-500' : 'border-gray-300'}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
                disabled={!isTeacher}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 pr-2 border-r">
            {PEN_SIZES.map((size) => (
              <button
                key={size}
                className={`w-8 h-8 rounded flex items-center justify-center ${penSize === size ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                onClick={() => setPenSize(size)}
                disabled={!isTeacher}
              >
                <div className="rounded-full bg-black" style={{ width: size, height: size }} />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pr-2 border-r">
            <Button
              variant={backgroundType === 'white' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setBackgroundType('white')}
              title="White Background"
            >
              <div className="w-4 h-4 border border-slate-300 bg-white" />
            </Button>
            <Button
              variant={backgroundType === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setBackgroundType('grid')}
              title="Grid Background"
            >
              <div className="w-4 h-4 border border-slate-300 bg-white bg-[linear-gradient(#e5e7eb_1px,transparent_1px),linear-gradient(90deg,#e5e7eb_1px,transparent_1px)] bg-[length:4px_4px]" />
            </Button>
            <Button
              variant={backgroundType === 'dots' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setBackgroundType('dots')}
              title="Dots Background"
            >
              <div className="w-4 h-4 border border-slate-300 bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-[length:4px_4px]" />
            </Button>
          </div>

          <div className="flex items-center gap-1 pr-2 border-r">
            <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndex <= 0}>
              <Undo className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1}>
              <Redo className="w-4 h-4" />
            </Button>
          </div>

          {isTeacher && (
            <>
              <Button variant="ghost" size="sm" onClick={clearBoard} className="text-red-500">
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={saveAsImage}>
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 relative" style={getBackgroundStyle()}>
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full ${isTeacher ? 'cursor-crosshair' : 'cursor-default'}`}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2"
          onClick={() => setShowToolbar(!showToolbar)}
        >
          {showToolbar ? 'Hide Tools' : 'Show Tools'}
        </Button>
      </div>
    </div>
  );
};

export default Whiteboard;
