


import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
const config: CapacitorConfig = {
  appId: 'com.ekarigar.ekmessenger',
  appName: 'ConvoIQ',
  webDir: 'www',
  server: {
  cleartext: true
},
   plugins: {
    // Keyboard: {
    //   resize: KeyboardResize.Ionic,          // Correct use of enum
    //   style: KeyboardStyle.Light,             // Also using enum
    //   resizeOnFullScreen: true,  
    //             // Optional Android workaround
    // },
    EdgeToEdge: {
      backgroundColor: "#ffffff",  // color for status + navigation bar
    },   
  },
};
 
export default config;