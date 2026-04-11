import { useState, useRef, useEffect, useCallback } from 'react';
import {
  VirtualBackground as LiveKitVirtualBackground,
  BackgroundBlur,
  supportsBackgroundProcessors,
  supportsModernBackgroundProcessors
} from '@livekit/track-processors';
import { LocalVideoTrack } from 'livekit-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Camera,
  Upload,
  Image,
  CircleDashed,
  X,
  Check,
  Loader2,
  Palette
} from 'lucide-react';
import { toast } from 'sonner';

interface VirtualBackgroundProps {
  localVideoTrack: LocalVideoTrack | null;
  isOpen: boolean;
  onClose: () => void;
}

interface BackgroundPreset {
  id: string;
  name: string;
  imageUrl: string;
  thumbnail?: string;
}

const PRESET_BACKGROUNDS: BackgroundPreset[] = [
  {
    id: 'office',
    name: 'Modern Office',
    imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&h=720&fit=crop'
  },
  {
    id: 'nature',
    name: 'Nature Garden',
    imageUrl: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=1280&h=720&fit=crop'
  },
  {
    id: 'beach',
    name: 'Tropical Beach',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1280&h=720&fit=crop'
  },
  {
    id: 'library',
    name: 'Cozy Library',
    imageUrl: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1280&h=720&fit=crop'
  },
  {
    id: 'space',
    name: 'Space Galaxy',
    imageUrl: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1280&h=720&fit=crop'
  },
  {
    id: 'abstract-blue',
    name: 'Abstract Blue',
    imageUrl: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1280&h=720&fit=crop'
  },
  {
    id: 'sunset',
    name: 'Golden Sunset',
    imageUrl: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1280&h=720&fit=crop'
  },
  {
    id: 'mountains',
    name: 'Mountain Vista',
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1280&h=720&fit=crop'
  }
];

export const VirtualBackgroundControl = ({
  localVideoTrack,
  isOpen,
  onClose
}: VirtualBackgroundProps) => {
  const [backgroundType, setBackgroundType] = useState<'none' | 'blur' | 'image'>('none');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customImageUrl, setCustomImageUrl] = useState<string>('');
  const [blurAmount, setBlurAmount] = useState<number>(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [currentProcessor, setCurrentProcessor] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkSupport = async () => {
      if (supportsBackgroundProcessors()) {
        setIsSupported(true);
      } else {
        setIsSupported(false);
        toast.error('Virtual backgrounds are not supported in this browser');
      }
    };
    checkSupport();
  }, []);

  const applyBackground = useCallback(async () => {
    console.log('[VirtualBG] Applying background:', { backgroundType, selectedPreset, customImageUrl, blurAmount });

    if (!localVideoTrack) {
      console.warn('[VirtualBG] Missing localVideoTrack');
      toast.error('Video track not ready. Please wait for camera to initialize.');
      return;
    }

    if (!isSupported) {
      console.warn('[VirtualBG] Processor not supported');
      return;
    }

    // Check if video track has valid dimensions
    const track = localVideoTrack as any;
    if (!track || !track.mediaStreamTrack) {
      console.warn('[VirtualBG] Invalid mediaStreamTrack');
      toast.error('Video track is invalid. Re-check camera permissions.');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Stop existing processor if any
      if (currentProcessor) {
        console.log('[VirtualBG] Stopping current processor');
        try {
          await Promise.race([
            localVideoTrack.stopProcessor(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Stop timeout')), 2000))
          ]);
        } catch (e) {
          console.warn('[VirtualBG] Stop processor timed out or failed:', e);
        }
        setCurrentProcessor(null);
      }

      // 2. Handle 'none' background
      if (backgroundType === 'none') {
        console.log('[VirtualBG] Removed background');
        toast.success('Virtual background disabled');
        return;
      }

      // 3. Create new processor
      let processor;
      if (backgroundType === 'blur') {
        console.log('[VirtualBG] Creating blur processor:', blurAmount);
        processor = BackgroundBlur(blurAmount);
      } else if (backgroundType === 'image') {
        const imageUrl = selectedPreset
          ? PRESET_BACKGROUNDS.find(p => p.id === selectedPreset)?.imageUrl || ''
          : customImageUrl;

        if (!imageUrl) {
          console.warn('[VirtualBG] No image URL selected');
          toast.error('Please select or enter a background image');
          return;
        }

        console.log('[VirtualBG] Creating image processor:', imageUrl);
        processor = LiveKitVirtualBackground(imageUrl);
      }

      // 4. Apply new processor with timeout
      if (processor) {
        console.log('[VirtualBG] Setting processor on track');

        await Promise.race([
          localVideoTrack.setProcessor(processor),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Apply timeout')), 8000))
        ]);

        setCurrentProcessor(processor);
        console.log('[VirtualBG] Applied successfully');
        toast.success('Virtual background applied!');
      }
    } catch (error: any) {
      console.error('[VirtualBG] Failed to apply background:', error);

      // Fallback: cleaning up state if failed
      try {
        await localVideoTrack.stopProcessor().catch(() => { });
      } catch (e) { }
      setCurrentProcessor(null);
      setBackgroundType('none');

      const errMsg = error.message === 'Apply timeout'
        ? 'Applying background is taking too long. Your device might be under heavy load.'
        : 'Failed to apply virtual background. Try reloading the page.';
      toast.error(errMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [localVideoTrack, backgroundType, selectedPreset, customImageUrl, blurAmount, isSupported, currentProcessor]);

  const handleRemoveBackground = async () => {
    if (!localVideoTrack) return;

    setIsProcessing(true);
    try {
      if (currentProcessor) {
        await localVideoTrack.stopProcessor();
        setCurrentProcessor(null);
      }
      setBackgroundType('none');
      setSelectedPreset('');
      setCustomImageUrl('');
      toast.success('Virtual background removed');
    } catch (error) {
      console.error('Failed to remove background:', error);
    }
    setIsProcessing(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setCustomImageUrl(result);
          setBackgroundType('image');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    return () => {
      if (localVideoTrack && currentProcessor) {
        localVideoTrack.stopProcessor().catch(console.error);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white">Virtual Background</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {isSupported === false ? (
            <div className="text-center py-8">
              <CircleDashed className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              <p className="text-amber-400 font-medium">Not Supported</p>
              <p className="text-slate-400 text-sm mt-1">
                Virtual backgrounds require Chrome, Edge, or Firefox with background segmentation support.
              </p>
            </div>
          ) : (
            <>
              <Tabs value={backgroundType} onValueChange={(v) => setBackgroundType(v as any)}>
                <TabsList className="grid grid-cols-3 bg-slate-800">
                  <TabsTrigger value="none" className="text-xs">None</TabsTrigger>
                  <TabsTrigger value="blur" className="text-xs">Blur</TabsTrigger>
                  <TabsTrigger value="image" className="text-xs">Image</TabsTrigger>
                </TabsList>

                <TabsContent value="blur" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-slate-300">Blur Amount</Label>
                      <span className="text-sm text-slate-400">{blurAmount}</span>
                    </div>
                    <Slider
                      value={[blurAmount]}
                      onValueChange={([v]) => setBlurAmount(v)}
                      min={1}
                      max={20}
                      step={1}
                      className="py-2"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="image" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Choose a Background</Label>
                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                      {PRESET_BACKGROUNDS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setSelectedPreset(preset.id);
                            setCustomImageUrl('');
                          }}
                          className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${selectedPreset === preset.id
                            ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                            : 'border-slate-700 hover:border-slate-600'
                            }`}
                        >
                          <img
                            src={preset.imageUrl}
                            alt={preset.name}
                            className="w-full h-full object-cover"
                          />
                          {selectedPreset === preset.id && (
                            <div className="absolute inset-0 bg-indigo-500/30 flex items-center justify-center">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Or Upload Custom</Label>
                    <div className="flex gap-2">
                      <Input
                        id="custom-bg-upload"
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 border-slate-700 hover:bg-slate-800"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Choose File
                      </Button>
                    </div>
                    {customImageUrl && (
                      <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-700">
                        <img src={customImageUrl} alt="Custom" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setCustomImageUrl('')}
                          className="absolute top-2 right-2 bg-black/50 rounded-full p-1 hover:bg-black/70"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={applyBackground}
                  disabled={isProcessing || (backgroundType === 'image' && !selectedPreset && !customImageUrl)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Apply
                </Button>
                {backgroundType !== 'none' && (
                  <Button
                    variant="outline"
                    onClick={handleRemoveBackground}
                    disabled={isProcessing}
                    className="border-slate-700 hover:bg-slate-800"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
