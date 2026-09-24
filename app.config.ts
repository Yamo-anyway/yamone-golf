import type { ConfigContext } from "expo/config";

// App IDs are public configuration, not credentials. All ad UNIT IDs remain
// Google's TestIds in native code; changing an app ID never enables live ads.
export default function configure({ config }: ConfigContext) {
  const ids = {
    androidAppId: process.env.ADMOB_TEST_ANDROID_APP_ID,
    iosAppId: process.env.ADMOB_TEST_IOS_APP_ID,
  };
  for (const id of Object.values(ids))
    if (id !== undefined && !/^ca-app-pub-\d{16}~\d{10}$/.test(id))
      throw Error(
        "Invalid ADMOB_TEST app ID. Expected ca-app-pub-<16 digits>~<10 digits>.",
      );
  return {
    ...config,
    plugins: config.plugins?.map((plugin) => {
      if (
        !Array.isArray(plugin) ||
        plugin[0] !== "react-native-google-mobile-ads"
      )
        return plugin;
      return [
        plugin[0],
        {
          ...plugin[1],
          ...(ids.androidAppId ? { androidAppId: ids.androidAppId } : {}),
          ...(ids.iosAppId ? { iosAppId: ids.iosAppId } : {}),
        },
      ] as [string, Record<string, unknown>];
    }),
  };
}
