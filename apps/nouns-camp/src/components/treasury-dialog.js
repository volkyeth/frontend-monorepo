import { formatUnits } from "viem";
import React from "react";
import { css } from "@emotion/react";
import { useBalance, useReadContract } from "wagmi";
import { useFetch } from "@shades/common/react";
import Dialog from "@shades/ui-web/dialog";
import DialogHeader from "@shades/ui-web/dialog-header";
import {
  parse as parseTransactions,
  extractAmounts as getRequestedAssets,
} from "../utils/transactions.js";
import { subgraphFetch as queryNounsSubgraph } from "../nouns-subgraph.js";
import useContract from "../hooks/contract.js";
import useChainId from "../hooks/chain-id.js";
import { useSearchParams } from "../hooks/navigation.js";
import useFeatureFlag from "../hooks/feature-flag.js";
import { FormattedEthWithConditionalTooltip } from "./transaction-list.js";

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

const formatUsdc = (usdc) => parseFloat(formatUnits(usdc, 6)).toLocaleString();

const useChainlinkUsdcToEthConverter = () => {
  const { data: rate } = useReadContract({
    // Chainlink USDC/ETH price feed
    address: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    abi: [
      {
        type: "function",
        name: "latestAnswer",
        inputs: [],
        outputs: [{ type: "int256" }],
      },
    ],
    functionName: "latestAnswer",
  });
  if (rate == null) return;
  return (usdc) => (usdc * 10n ** 23n) / rate;
};

const useAuctionProceeds = ({ days = 30 } = {}) => {
  const chainId = useChainId();
  const [proceeds, setProceeds] = React.useState(null);

  useFetch(async () => {
    const query = `{
      auctions(
        where: { settled: true },
        orderDirection: desc,
        orderBy: startTime,
        first: ${days}
      ) {
        amount
      }
    }`;
    const { auctions } = await queryNounsSubgraph({ chainId, query });
    const proceeds = auctions.reduce(
      (sum, { amount }) => sum + BigInt(amount),
      BigInt(0),
    );
    setProceeds(proceeds);
  }, [days, chainId]);

  return proceeds;
};

const useAssetsDeployed = ({ days = 30 } = {}) => {
  const chainId = useChainId();
  const [assets, setAssets] = React.useState(null);

  useFetch(async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const query = `{
      proposals(
        where: { executedTimestamp_gt: ${nowSeconds - days * ONE_DAY_IN_SECONDS} },
        orderDirection: desc,
        orderBy: executedBlock,
        first: 1000
      ) {
        targets
        signatures
        calldatas
        values
      }
    }`;
    const { proposals } = await queryNounsSubgraph({ chainId, query });
    const transactions = proposals.flatMap((proposal) =>
      parseTransactions(proposal, { chainId }),
    );
    const assets = getRequestedAssets(transactions).reduce((assets, asset) => {
      // Merge ETH amounts
      if (asset.currency.endsWith("eth")) {
        const ethAmount =
          assets.find(({ currency }) => currency === "eth")?.amount ?? 0n;
        return [
          { currency: "eth", amount: ethAmount + asset.amount },
          ...assets.filter(({ currency }) => currency !== "eth"),
        ];
      }
      return [...assets, asset];
    }, []);
    setAssets(assets);
  }, [chainId, days]);

  return assets;
};

const useBalanceOf = ({ contract, account }) => {
  const address = useContract(contract)?.address;
  const { data: balance } = useReadContract({
    address,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        inputs: [{ type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [account],
  });
  return balance;
};

const useBalances = () => {
  const treasuryAddress = useContract("executor")?.address;
  const forkEscrowAddress = useContract("fork-escrow")?.address;
  const daoProxyAddress = useContract("dao")?.address;
  const tokenBuyerAddress = useContract("token-buyer")?.address;

  const { data: treasuryEthBalance } = useBalance({ address: treasuryAddress });
  const { data: daoProxyEthBalance } = useBalance({ address: daoProxyAddress });
  const { data: tokenBuyerEthBalance } = useBalance({
    address: tokenBuyerAddress,
  });

  const treasuryUsdc = useBalanceOf({
    contract: "usdc-token",
    account: treasuryAddress,
  });
  const treasuryWeth = useBalanceOf({
    contract: "weth-token",
    account: treasuryAddress,
  });
  const treasuryReth = useBalanceOf({
    contract: "reth-token",
    account: treasuryAddress,
  });
  const treasurySteth = useBalanceOf({
    contract: "steth-token",
    account: treasuryAddress,
  });
  const treasuryWsteth = useBalanceOf({
    contract: "wsteth-token",
    account: treasuryAddress,
  });
  const forkEscrowNouns = useBalanceOf({
    contract: "token",
    account: forkEscrowAddress,
  });
  const treasuryNouns = useBalanceOf({
    contract: "token",
    account: treasuryAddress,
  });

  return {
    treasuryEth: treasuryEthBalance?.value,
    daoProxyEth: daoProxyEthBalance?.value,
    tokenBuyerEth: tokenBuyerEthBalance?.value,
    treasuryUsdc,
    treasuryWeth,
    treasuryReth,
    treasurySteth,
    treasuryWsteth,
    forkEscrowNouns,
    treasuryNouns,
  };
};

const TreasuryDialog = ({ isOpen, close }) => (
  <Dialog
    isOpen={isOpen}
    onRequestClose={() => {
      close();
    }}
    width="44rem"
  >
    {(props) => <Content dismiss={close} {...props} />}
  </Dialog>
);

const Content = ({ titleProps, dismiss }) => {
  const [searchParams] = useSearchParams();

  const forkEscrowAddress = useContract("fork-escrow")?.address;
  const daoProxyAddress = useContract("dao")?.address;
  const tokenBuyerAddress = useContract("token-buyer")?.address;

  const {
    treasuryEth,
    treasuryUsdc,
    treasuryWeth,
    treasuryReth,
    treasurySteth,
    treasuryWsteth,
    treasuryNouns,
    daoProxyEth,
    tokenBuyerEth,
    forkEscrowNouns,
  } = useBalances();

  const activityDayCount = searchParams.get("timeframe") ?? 30;

  const auctionProceeds = useAuctionProceeds({ days: activityDayCount });
  const assetsDeployed = useAssetsDeployed({ days: activityDayCount });

  const convertUsdcToEth = useChainlinkUsdcToEthConverter();
  const showRecentActivity = useFeatureFlag("treasury-activity");

  return (
    <div
      css={css({
        overflow: "auto",
        padding: "1.5rem",
        "@media (min-width: 600px)": {
          padding: "2rem",
        },
      })}
    >
      <DialogHeader
        title="Treasury"
        titleProps={titleProps}
        dismiss={dismiss}
        css={css({
          margin: "0 0 2.4rem",
          "@media (min-width: 600px)": {
            margin: "0 0 2.4rem",
          },
        })}
      />
      <main>
        <Heading>Asset overview</Heading>
        <Dl>
          {[
            {
              label: "ETH",
              formatting: "eth",
              amount: treasuryEth,
            },
            {
              label: "stETH",
              formatting: "eth",
              amount: treasurySteth,
            },
            {
              label: "USDC",
              formatting: "usdc",
              amount: treasuryUsdc,
            },
            {
              label: "rETH",
              formatting: "eth",
              amount: treasuryReth,
            },
            {
              label: "wETH",
              formatting: "eth",
              amount: treasuryWeth,
            },
            {
              label: "wstETH",
              formatting: "eth",
              amount: treasuryWsteth,
            },
            {
              label: "Nouns",
              amount: treasuryNouns,
            },
          ].map(({ label, formatting, amount }, i) => (
            <React.Fragment key={i}>
              <dt>{label}</dt>
              <dd>
                {(() => {
                  if (amount == null) return null;
                  switch (formatting) {
                    case "eth":
                      return (
                        <FormattedEthWithConditionalTooltip
                          portal
                          value={amount}
                          decimals={2}
                          truncationDots={false}
                          tokenSymbol={false}
                          localeFormatting
                        />
                      );

                    case "usdc":
                      return (
                        <>
                          {formatUsdc(amount)}{" "}
                          {convertUsdcToEth != null && (
                            <span data-small>
                              ({"\u2248"}
                              <FormattedEthWithConditionalTooltip
                                portal
                                value={convertUsdcToEth(amount)}
                                decimals={2}
                                truncationDots={false}
                                localeFormatting
                              />
                              )
                            </span>
                          )}
                        </>
                      );

                    default:
                      return Number(amount);
                  }
                })()}
              </dd>
            </React.Fragment>
          ))}
        </Dl>

        {showRecentActivity && (
          <>
            <Heading>Activity last {activityDayCount} days</Heading>
            <Dl>
              <dt>Auction proceeds</dt>
              <dd>
                {auctionProceeds != null && (
                  <FormattedEthWithConditionalTooltip
                    portal
                    value={auctionProceeds}
                    decimals={2}
                    truncationDots={false}
                    localeFormatting
                  />
                )}
              </dd>
              <dt>Assets deployed</dt>
              <dd>
                {assetsDeployed != null && (
                  <ul
                    css={css({
                      listStyle: "none",
                      "li + li": { marginTop: "0.4rem" },
                    })}
                  >
                    {assetsDeployed.map((asset) => (
                      <li key={asset.currency}>
                        {(() => {
                          switch (asset.currency) {
                            case "eth":
                              return (
                                <FormattedEthWithConditionalTooltip
                                  portal
                                  value={asset.amount}
                                  decimals={2}
                                  truncationDots={false}
                                  tokenSymbol="ETH"
                                  localeFormatting
                                />
                              );

                            case "usdc":
                              return (
                                <>
                                  {formatUsdc(asset.amount)} USDC{" "}
                                  {convertUsdcToEth != null && (
                                    <span data-small>
                                      ({"\u2248"}
                                      <FormattedEthWithConditionalTooltip
                                        portal
                                        value={convertUsdcToEth(asset.amount)}
                                        decimals={2}
                                        truncationDots={false}
                                        localeFormatting
                                      />
                                      )
                                    </span>
                                  )}
                                </>
                              );

                            case "nouns": {
                              const count = asset.tokens.length;
                              return (
                                <>
                                  {count} {count === 1 ? "Noun" : "Nouns"}
                                </>
                              );
                            }

                            default:
                              throw new Error();
                          }
                        })()}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </Dl>
          </>
        )}

        <Heading>Other contracts</Heading>
        <Dl>
          {tokenBuyerEth != null && (
            <>
              <dt>
                <EtherscanLink address={tokenBuyerAddress}>
                  Token Buyer
                </EtherscanLink>
              </dt>
              <dd>
                <FormattedEthWithConditionalTooltip
                  portal
                  value={tokenBuyerEth}
                  decimals={2}
                  truncationDots={false}
                  localeFormatting
                />{" "}
                <span data-small>(swaps ETH &rarr; USDC)</span>
              </dd>
            </>
          )}
          {daoProxyEth != null && (
            <>
              <dt>
                <EtherscanLink address={daoProxyAddress}>
                  DAO Proxy
                </EtherscanLink>
              </dt>
              <dd>
                <FormattedEthWithConditionalTooltip
                  portal
                  value={daoProxyEth}
                  decimals={2}
                  truncationDots={false}
                  localeFormatting
                />{" "}
                <span data-small>(used for vote refunds)</span>
              </dd>
            </>
          )}
          {forkEscrowNouns != null && (
            <>
              <dt>
                <EtherscanLink address={forkEscrowAddress}>
                  Fork Escrow
                </EtherscanLink>
              </dt>
              <dd>{Number(forkEscrowNouns)} Nouns</dd>
            </>
          )}
        </Dl>
        <p
          css={(t) =>
            css({
              margin: "2.8rem 0 0",
              fontSize: t.text.sizes.small,
              color: t.colors.textDimmed,
              a: {
                color: t.colors.textDimmed,
                textDecoration: "none",
                "@media(hover: hover)": {
                  ":hover": { textDecoration: "underline" },
                },
              },
            })
          }
        >
          More at{" "}
          <a href="https://tabs.wtf" target="_blank" rel="norefferer">
            tabs.wtf {"\u2197"}
          </a>
        </p>
      </main>
    </div>
  );
};

const EtherscanLink = ({ address, ...props }) => (
  <a
    href={`https://etherscan.io/address/${address}`}
    target="_blank"
    rel="noreferrer"
    {...props}
  />
);

const Dl = (props) => (
  <dl
    css={(t) =>
      css({
        display: "grid",
        gap: "0.4rem 1.6rem",
        gridTemplateColumns: "auto minmax(0,1fr)",
        a: {
          color: "inherit",
          textDecoration: "none",
          "@media(hover: hover)": {
            ":hover": {
              color: t.colors.textDimmed,
            },
          },
        },
        "[data-small]": {
          fontSize: t.text.sizes.small,
          color: t.colors.textDimmed,
        },
      })
    }
    {...props}
  />
);

const Heading = (props) => (
  <h2
    css={(t) =>
      css({
        textTransform: "uppercase",
        fontSize: t.text.sizes.small,
        fontWeight: t.text.weights.emphasis,
        color: t.colors.textDimmed,
        margin: "2.8rem 0 1rem",
      })
    }
    {...props}
  />
);

export default TreasuryDialog;
