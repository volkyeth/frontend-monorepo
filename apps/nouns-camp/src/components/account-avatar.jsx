import React from "react";
import { css } from "@emotion/react";
import { useEnsAvatar } from "wagmi";
import { array as arrayUtils } from "@shades/common/utils";
import Avatar from "@shades/ui-web/avatar";
import { CHAIN_ID } from "@/constants/env";
import { useNounsRepresented } from "@/store";
import useEnsName from "@/hooks/ens-name";
import { useNounSeeds } from "@/hooks/token-contract";

const { reverse } = arrayUtils;

const useNounAvatars = (
  seeds,
  { enabled = true, transparent = false } = {},
) => {
  const [avatarUrls, setAvatarUrls] = React.useState(null);

  React.useEffect(() => {
    if (!enabled || seeds == null) return;
    import("@shades/common/nouns").then((module) => {
      const urls = seeds.map((seed) =>
        module.buildDataUriFromSeed(seed, { transparent }),
      );
      setAvatarUrls(urls);
    });
  }, [enabled, transparent, seeds == null]); // eslint-disable-line

  return avatarUrls;
};

const NounsAccountAvatar = React.forwardRef(
  (
    {
      address: accountAddress,
      placeholder = true,
      transparent = false,
      maxStackCount = 2,
      ensOnly = false,
      fallbackImageUrl,
      borderRadius = "0.3rem",
      ...props
    },
    ref,
  ) => {
    const nouns = useNounsRepresented(accountAddress);

    const ensName = useEnsName(accountAddress);
    const { data: ensAvatarUrl } = useEnsAvatar({
      name: ensName,
      chainId: CHAIN_ID,
      query: {
        enabled: ensName != null,
      },
    });

    // const isMissingSeeds = nouns != null && nouns.some((n) => n.seed == null);

    const fetchedNounSeeds = useNounSeeds(nouns?.map((n) => n.id) ?? [], {
      enabled: false,
      // enabled: !ensOnly && ensAvatarUrl == null && isMissingSeeds,
    });

    const nounSeeds = fetchedNounSeeds ?? nouns?.map((n) => n.seed);

    const enablePlaceholder = ensAvatarUrl == null;

    const nounAvatarUrls = useNounAvatars(nounSeeds, {
      enabled: !ensOnly && enablePlaceholder,
      transparent,
    });

    if (
      ensAvatarUrl == null &&
      nounAvatarUrls != null &&
      nounAvatarUrls.length > 1
    )
      return (
        <AvatarStack urls={nounAvatarUrls} count={maxStackCount} {...props} />
      );

    const nounAvatarUrl = nounAvatarUrls?.[0];
    const imageUrl = ensAvatarUrl ?? nounAvatarUrl ?? fallbackImageUrl;

    if (!placeholder && imageUrl == null) return null;

    return (
      <Avatar
        ref={ref}
        url={imageUrl}
        borderRadius={imageUrl === nounAvatarUrl ? undefined : borderRadius}
        signature={ensName ?? accountAddress?.slice(2)}
        signatureLength={2}
        signatureFontSize="0.95rem"
        {...props}
      />
    );
  },
);

const AvatarStack = ({
  urls = [],
  count: maxCount = 4,
  style,
  borderRadius,
  background,
  ...props
}) => {
  const size = typeof props.size === "number" ? `${props.size}px` : props.size;
  const count = Math.min(urls.length, maxCount);
  const offset = `calc(${size} * (1 / (3 * ${count})))`;

  return (
    <div
      style={{
        width: props.size,
        height: props.size,
        position: "relative",
        zIndex: 0,
        ...style,
      }}
      {...props}
    >
      {reverse(urls.slice(0, count)).map((url, i) => (
        <Avatar
          key={url}
          url={url}
          borderRadius={borderRadius}
          background={background}
          css={css({
            position: "absolute",
            bottom: `calc(${offset} * ${i})`,
            right: `calc(${offset} * ${i})`,
            width: `calc(100% - ${offset} * ${count - 1})`,
            height: `calc(100% - ${offset} * ${count - 1})`,
            boxShadow: i !== 0 ? `1px 1px 0 0px rgb(0 0 0 / 30%)` : undefined,
          })}
        />
      ))}
    </div>
  );
};

export default NounsAccountAvatar;
