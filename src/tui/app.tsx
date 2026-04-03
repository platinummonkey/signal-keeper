import React, { useState } from 'react';
import { render } from 'ink';
import { PRListScreen } from './screens/pr-list.js';
import { PRDetailScreen } from './screens/pr-detail.js';
import { CustomPromptScreen } from './screens/custom-prompt.js';
import { ConfirmScreen } from './screens/confirm.js';
import { CommentInputScreen } from './screens/comment-input.js';
import { actionMerge, actionClose, actionComment } from '../github/pr-actions.js';
import { reviewPR } from '../review/engine.js';
import { runAutofix } from '../autofix/index.js';
import { logger } from '../utils/logger.js';
import type { PRWithReview } from './hooks/use-pr-list.js';
import type { ConfigOutput } from '../config/schema.js';

type Screen =
  | 'list'
  | 'detail'
  | 'custom-prompt'
  | 'confirm-merge'
  | 'confirm-close'
  | 'comment-input';

interface AppProps {
  config: ConfigOutput;
}

function App({ config }: AppProps) {
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

  // --- Screen rendering ---

  if (screen === 'confirm-merge' && selectedPR) {
    return (
      <ConfirmScreen
        message={`Merge ${selectedPR.owner}/${selectedPR.repo}#${selectedPR.number} — "${selectedPR.title}"?`}
        onConfirm={() => executeMerge(selectedPR)}
        onCancel={backToDetail}
      />
    );
  }

  if (screen === 'confirm-close' && selectedPR) {
    return (
      <ConfirmScreen
        message={`Close ${selectedPR.owner}/${selectedPR.repo}#${selectedPR.number} — "${selectedPR.title}"?`}
        onConfirm={() => executeClose(selectedPR)}
        onCancel={backToDetail}
      />
    );
  }

  if (screen === 'comment-input' && selectedPR) {
    return (
      <CommentInputScreen
        prLabel={`${selectedPR.owner}/${selectedPR.repo}#${selectedPR.number}`}
        onSubmit={(body) => executeComment(selectedPR, body)}
        onCancel={backToDetail}
      />
    );
  }

  if (screen === 'custom-prompt' && pendingReview) {
    return (
      <CustomPromptScreen
        onSubmit={(prompt) => {
          backToDetail();
          handleReReview(pendingReview, prompt);
        }}
        onCancel={backToDetail}
      />
    );
  }

  if (screen === 'detail' && selectedPR) {
    return (
      <PRDetailScreen
        pr={selectedPR}
        config={config}
        onBack={goBack}
        onMerge={handleMerge}
        onComment={handleComment}
        onClose={handleClose}
        onReReview={handleReReview}
        onAutofix={handleAutofix}
      />
    );
  }

  return (
    <PRListScreen
      onOpenDetail={openDetail}
      onQuit={() => process.exit(0)}
      statusMessage={statusMessage}
    />
  );
}

export function renderApp(config: ConfigOutput): void {
  render(<App config={config} />);
}
