import * as github from "@actions/github";
import { evaluate } from "@marcbachmann/cel-js";

import {
  buildCELContext,
  listComments,
  parseCommentMeta,
  type Logger,
} from "../../lib/comment";

export type RunInput = {
  octokit: ReturnType<typeof github.getOctokit>;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  commitSHA: string;
  ifCondition: string;
  logger: Logger;
};

export type RunResult = {
  hiddenCount: number;
  totalCount: number;
};

export const minimizeComment = async (
  octokit: ReturnType<typeof github.getOctokit>,
  commentId: string,
): Promise<void> => {
  await octokit.graphql(
    `
    mutation($id: ID!) {
      minimizeComment(input: {subjectId: $id, classifier: OUTDATED}) {
        minimizedComment {
          isMinimized
        }
      }
    }
  `,
    { id: commentId },
  );
};

export const run = async (input: RunInput): Promise<RunResult> => {
  const {
    octokit,
    repoOwner,
    repoName,
    prNumber,
    commitSHA,
    ifCondition,
    logger,
  } = input;

  const comments = await listComments(octokit, repoOwner, repoName, prNumber);
  logger.info(`Found ${comments.length} comments on PR #${prNumber}`);

  let hiddenCount = 0;
  let totalCount = 0;

  for (const comment of comments) {
    if (comment.isMinimized) {
      continue;
    }
    totalCount++;

    const meta = parseCommentMeta(comment.body);
    const context = buildCELContext(meta, commitSHA);
    let result: unknown = false;
    try {
      result = evaluate(ifCondition, context);
    } catch (e: unknown) {
      logger.debug(`evaluate the expression: ${e}`);
    }

    if (result) {
      logger.debug(`Hiding comment ${comment.id}`);
      await minimizeComment(octokit, comment.id);
      hiddenCount++;
    }
  }

  return { hiddenCount, totalCount };
};
