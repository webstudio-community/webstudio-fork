import { useMemo, useState } from "react";
import { computed } from "nanostores";
import { useStore } from "@nanostores/react";
import { Button, Flex, FloatingPanel } from "@webstudio-is/design-system";
import {
  acceptToMimeCategories,
  formatAssetName,
  type Asset,
  type AssetType,
} from "@webstudio-is/sdk";
import { $assets } from "~/shared/sync/data-stores";
import { AssetManager } from "~/builder/shared/asset-manager";
import { AssetUpload } from "~/builder/shared/assets";

// Upload is offered only when `accept` maps to a single asset type,
// e.g. "image/*" -> image, "application/json" (Lottie) -> file.
const getUploadType = (accept?: string): AssetType | undefined => {
  const acceptCategories = acceptToMimeCategories(accept || "");
  if (acceptCategories === "*") {
    return "image";
  }
  if (acceptCategories.size !== 1) {
    return;
  }
  const [category] = acceptCategories;
  if (category === "image" || category === "font" || category === "video") {
    return category;
  }
  return "file";
};

type Props = {
  accept?: string;
  assetId?: Asset["id"];
  title?: string;
  triggerLabel?: string;
  disabled?: boolean;
  onChange: (assetId: Asset["id"]) => void;
};

export const SelectAsset = ({
  accept,
  assetId,
  title,
  triggerLabel,
  disabled,
  onChange,
}: Props) => {
  const [open, setOpen] = useState(false);
  const $asset = useMemo(
    () =>
      computed($assets, (assets) =>
        assetId === undefined ? undefined : assets.get(assetId)
      ),
    [assetId]
  );

  const asset = useStore($asset);
  const uploadType = getUploadType(accept);

  return (
    <Flex gap={2} css={{ flex: 1 }} align="center">
      <FloatingPanel
        open={open}
        onOpenChange={setOpen}
        title={title ?? (uploadType === "image" ? "Images" : "Assets")}
        titleSuffix={
          uploadType !== undefined ? (
            <AssetUpload type={uploadType} accept={accept} />
          ) : undefined
        }
        content={
          <AssetManager
            onChange={(assetId) => {
              setOpen(false);
              onChange(assetId);
            }}
            accept={accept}
          />
        }
      >
        <Button css={{ flex: 1 }} disabled={disabled}>
          {triggerLabel ?? (asset ? formatAssetName(asset) : "Choose source")}
        </Button>
      </FloatingPanel>
    </Flex>
  );
};
