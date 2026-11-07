import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

// Photos are shrunk on the device before upload: cheaper, faster, and the original never leaves the phone.
export async function pickPhoto(source: 'camera' | 'library', front = false): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is needed for this. You can still choose a photo instead.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  const ctx = ImageManipulator.manipulate(a.uri);
  if ((a.width ?? 0) > 1280 || (a.height ?? 0) > 1280) ctx.resize((a.width ?? 0) >= (a.height ?? 0) ? { width: 1280, height: null } : { width: null, height: 1280 });
  const saved = await (await ctx.renderAsync()).saveAsync({ base64: true, compress: 0.82, format: SaveFormat.JPEG });
  return `data:image/jpeg;base64,${saved.base64}`;
}
