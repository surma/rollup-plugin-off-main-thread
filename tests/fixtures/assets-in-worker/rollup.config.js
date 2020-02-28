const MARKER = "my-special-import";
module.exports = (config, omt) => {
  config.plugins = [
    omt(),
    {
      resolveId(id) {
        if (id !== MARKER) {
          return;
        }
        return id;
      },
      load(id) {
        if (id !== MARKER) {
          return;
        }
        const assetReferenceId = this.emitAsset("my-asset.bin", "assetcontent");
        return `export default import.meta.ROLLUP_ASSET_URL_${assetReferenceId}`;
      }
    }
  ];
};
