import React, { useState } from 'react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import Checkbox from './Checkbox';

interface AgentBridgeHelpModalProps {
  onClose: () => void;
  onConfirm: (remember: boolean) => void;
}

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Keep your AI client open',
    body: (
      <>
        It talks to the app through the lemon MCP server. Run{' '}
        <code className="text-zinc-200">npm run mcp:install</code> once in the repo to register it
        with the AI clients on this machine.
      </>
    ),
  },
  {
    title: 'Turn the bridge on',
    body: 'The dot next to File → Agent bridge goes green once the app reaches the helper. It retries on its own.',
  },
  {
    title: 'Ask the agent to edit this project',
    body: (
      <>
        For example: <span className="text-zinc-200">“break down scene 4 into props, wardrobe and vehicles”</span>,{' '}
        <span className="text-zinc-200">“add 5 dummy crew to the grip department”</span>, or{' '}
        <span className="text-zinc-200">“schedule the diner scene on day 3”</span>.
      </>
    ),
  },
];

export default function AgentBridgeHelpModal({ onClose, onConfirm }: AgentBridgeHelpModalProps) {
  const [remember, setRemember] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title="Agent bridge"
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>
            Not now
          </ModalFooterButton>
          <ModalFooterButton onClick={() => onConfirm(remember)}>
            Turn on bridge
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 space-y-4 text-sm text-zinc-300">
        <p>
          Lets an AI agent read and edit the project you have open here — useful for a first-pass
          breakdown, dummy crew, or bulk edits. Everything stays on this machine and every change
          is a normal undoable step (<kbd className="text-zinc-200">⌘Z</kbd>).
        </p>
        <ol className="space-y-2.5 list-decimal list-inside marker:text-zinc-500">
          {STEPS.map((step) => (
            <li key={step.title}>
              <span className="font-medium text-zinc-100">{step.title}</span>
              <p className="pl-5 mt-0.5 text-zinc-400">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-zinc-500">
          The helper listens on 127.0.0.1 only and only while the bridge is on. Turn it off any
          time from the same menu.
        </p>
        <Checkbox
          block
          checked={remember}
          onChange={setRemember}
          label="Don't show this again (24 hours)"
        />
      </div>
    </Modal>
  );
}
