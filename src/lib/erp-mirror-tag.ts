// The cache tag on the MIRROR map only (lib/unleashed). The hourly mirror cron
// expires it outright; nothing expires the live Unleashed map, which keeps its
// own hourly revalidate. Its own file so the cron route can name the tag
// without loading lib/unleashed and everything that imports.
export const ERP_MIRROR_TAG = "erp-mirror";
