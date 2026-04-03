import React, { useState } from 'react';
import { render, useStdout, Box } from 'ink';
import { PRListScreen } from './screens/pr-list.js';
import { PRDetailScreen } from './screens/pr-detail.js';
import { CustomPromptScreen } from './screens/custom-prompt.js';
import { ConfirmScreen } from './screens/confirm.js';
import { CommentInputScreen } from './screens/comment-input.js';
import { GenerateCommentScreen } from './screens/generate-comment.js';
import { actionMerge, actionClose, actionComment } from '../github/pr-actions.js';
import { reviewPR, generateCommentFromReview } from '../review/engine.js';
import { getLatestReview } from '../state/models.js';
import { runAutofix } from '../autofix/index.js';
import { approveExternalCI } from '../daemon.js';
import { logger } from '../utils/logger.js';
import type { PRWithReview } from './hooks/use-pr-list.js';
import type { ConfigOutput } from '../config/schema.js';

type Screen =
  | 'list'
  | 'detail'
  | 'custom-prompt'
  | 'generate-comment'
  | 'confirm-merge'
  | 'confirm-close'
  | 'comment-input';

interface AppProps {
  config: ConfigOutput;
}

function App({ config }: AppProps) {
  const { stdout } = useStdout();
  const height = stdout?.rows ?? 24;
  const width = stdout?.columns ?? 80;

  const [screen, setScreen] = useState<Screen>('list');
  const [selectedPR, setSelectedPR] = useState<PRWithReview | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const [pendingReview, setPendingReview] = useState<PRWithReview | null>(null);

  function openDetail(pr: PRWithReview) {
    setSelectedPR(pr);
    setScreen('detail');
  }

  function goBack() {
    setScreen('list');
    setSelectedPR(null);
    setPendingReview(null);
  }

  function backToDetail() {
    setScreen('detail');
    setPendingReview(null);
  }

  async function handleMerge(pr: PRWithReview) {
    setSelectedPR(pr);
    setScreen('confirm-merge');
  }

  async function executeMerge(pr: PRWithReview) {
    setScreen('detail');
    setStatusMessage('Merging…');
    try {
      await actionMerge(pr.id, pr.owner, pr.repo, pr.number, pr.head_sha);
      setStatusMessage(`✓ Merged ${pr.owner}/${pr.repo}#${pr.number}`);
      goBack();
    } catch (err) {
      setStatusMessage(`Merge failed: ${(err as Error).message}`);
      logger.error({ err }, 'Merge failed');
    }
  }

  async function handleClose(pr: PRWithReview) {
    setSelectedPR(pr);
    setScreen('confirm-close');
  }

  async function executeClose(pr: PRWithReview) {
    setScreen('detail');
    setStatusMessage('Closing…');
    try {
      await actionClose(pr.id, pr.owner, pr.repo, pr.number);
      setStatusMessage(`✓ Closed ${pr.owner}/${pr.repo}#${pr.number}`);
      goBack();
    } catch (err) {
      setStatusMessage(`Close failed: ${(err as Error).message}`);
    }
  }

  function handleComment(pr: PRWithReview) {
    setSelectedPR(pr);
    setScreen('comment-input');
  }

  async function executeComment(pr: PRWithReview, body: string) {
    setScreen('detail');
    setStatusMessage('Posting comment…');
    try {
      await actionComment(pr.id, pr.owner, pr.repo, pr.number, body);
      setStatusMessage(`✓ Comment posted on ${pr.owner}/${pr.repo}#${pr.number}`);
    } catch (err) {
      setStatusMessage(`Comment failed: ${(err as Error).message}`);
    }
  }

  function handleReReview(pr: PRWithReview, customPrompt?: string) {
    if (customPrompt !== undefined) {
      setStatusMessage('Re-reviewing…');
      reviewPR(pr.owner, pr.repo, pr.number, config, customPrompt)
        .then(() => setStatusMessage('✓ Re-review complete'))
        .catch((err) => setStatusMessage(`Re-review failed: ${(err as Error).message}`));
    } else {
      setPendingReview(pr);
      setScreen('custom-prompt');
    }
  }

  async function handleApproveCI(pr: PRWithReview) {
    setStatusMessage('Approving CI workflows…');
    try {
      await approveExternalCI(pr);
      setStatusMessage(`✓ CI approved for ${pr.owner}/${pr.repo}#${pr.number} — watching for completion`);
    } catch (err) {
      setStatusMessage(`CI approval failed: ${(err as Error).message}`);
    }
  }

  async function handleAutofix(pr: PRWithReview) {
    setStatusMessage('Starting autofix…');
    runAutofix(pr, config)
      .then((result) => {
        setStatusMessage(`✓ Autofix PR: ${result.followUpPrUrl ?? 'branch pushed'}`);
      })
      .catch((err) => {
        setStatusMessage(`Autofix failed: ${(err as Error).message}`);
      });
  }

  function handleGenerateComment(pr: PRWithReview) {
    setSelectedPR(pr);
    setScreen('generate-comment');
  }

  async function executeGenerateComment(pr: PRWithReview, instruction: string) {
    setScreen('detail');
    setStatusMessage('Generating comment…');
    try {
      const effectiveInstruction = instruction || 'Summarise the review findings for the author, focusing on what needs to change and why.';
      const result = await generateCommentFromReview(pr.id, effectiveInstruction, config);
      // Post the generated comment directly and show a preview in the status bar
      await actionComment(pr.id, pr.owner, pr.repo, pr.number, result.body);
      setStatusMessage(`✓ Comment posted on ${pr.owner}/${pr.repo}#${pr.number}`);
    } catch (err) {
      setStatusMessage(`Generate comment failed: ${(err as Error).message}`);
    }
  }

  // --- Screen rendering ---

  let content: React.ReactNode;

  if (screen === 'confirm-merge' && selectedPR) {
    content = (
      <ConfirmScreen
        message={`Merge ${selectedPR.owner}/${selectedPR.repo}#${selectedPR.number} — "${selectedPR.title}"?`}
        onConfirm={() => executeMerge(selectedPR)}
        onCancel={backToDetail}
      />
    );
  } else if (screen === 'confirm-close' && selectedPR) {
    content = (
      <ConfirmScreen
        message={`Close ${selectedPR.owner}/${selectedPR.repo}#${selectedPR.number} — "${selectedPR.title}"?`}
        onConfirm={() => executeClose(selectedPR)}
        onCancel={backToDetail}
      />
    );
  } else if (screen === 'comment-input' && selectedPR) {
    content = (
      <CommentInputScreen
        prLabel={`${selectedPR.owner}/${selectedPR.repo}#${selectedPR.number}`}
        onSubmit={(body) => executeComment(selectedPR, body)}
        onCancel={backToDetail}
      />
    );
  } else if (screen === 'custom-prompt' && pendingReview) {
    content = (
      <CustomPromptScreen
        onSubmit={(prompt) => {
          backToDetail();
          handleReReview(pendingReview, prompt);
        }}
        onCancel={backToDetail}
      />
    );
  } else if (screen === 'generate-comment' && selectedPR) {
    const review = getLatestReview(selectedPR.id);
    content = (
      <GenerateCommentScreen
        prLabel={`${selectedPR.owner}/${selectedPR.repo}#${selectedPR.number}`}
        hasSession={!!review?.session_id}
        onSubmit={(instruction) => executeGenerateComment(selectedPR, instruction)}
        onCancel={backToDetail}
      />
    );
  } else if (screen === 'detail' && selectedPR) {
    content = (
      <PRDetailScreen
        pr={selectedPR}
        config={config}
        onBack={goBack}
        onMerge={handleMerge}
        onComment={handleComment}
        onClose={handleClose}
        onReReview={handleReReview}
        onAutofix={handleAutofix}
        onApproveCI={handleApproveCI}
        onGenerateComment={handleGenerateComment}
      />
    );
  } else {
    content = (
      <PRListScreen
        onOpenDetail={openDetail}
        onQuit={() => process.exit(0)}
        statusMessage={statusMessage}
      />
    );
  }

  return (
    <Box width={width} height={height} flexDirection="column">
      {content}
    </Box>
  );
}

export function renderApp(config: ConfigOutput): void {
  render(<App config={config} />);
}
