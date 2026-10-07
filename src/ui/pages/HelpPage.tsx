import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import phoneSetup from '../../../PHONE_SETUP.md?raw';
import Header from '../components/Header';

export default function HelpPage() {
  return (
    <>
      <Header title="Help" back="/" />
      <main className="page help-content">
        <Markdown remarkPlugins={[remarkGfm]}>{phoneSetup}</Markdown>
      </main>
    </>
  );
}