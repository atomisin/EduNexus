export type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'line' | 'rectangle' | 'circle';

export interface DrawEvent {
  type: 'draw';
  tool: Tool;
  color: string;
  size: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface WhiteboardState {
  imageData: string;
  tool?: Tool;
  color?: string;
  penSize?: number;
  backgroundType?: 'white' | 'grid' | 'dots';
}
