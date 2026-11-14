import { useMetadata } from '../api/hooks';
import { InfoBox, PageHeader, QueryState } from '../components';
import { PredictWorkspace } from './predict/PredictWorkspace';

export default function PredictPage() {
  const metadata = useMetadata();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Predict a student's risk"
        lede="Enter a student's details, or load a real example, to see how likely the model thinks they are to drop out, and which answers drive that."
      />
      <InfoBox>
        <ul className="list-disc space-y-1 pl-5">
          <li>Pick the stage: the further into the first year, the more the model knows and the more reliable it gets.</li>
          <li>The result updates as you change answers. Red bars push towards dropout, blue bars push away.</li>
          <li>This is a research demo built on past students. It is a starting point for a conversation, never a decision about a person.</li>
        </ul>
      </InfoBox>
      <QueryState query={metadata} loadingLabel="Loading the form…" errorTitle="Could not load the form">
        {(meta) => <PredictWorkspace meta={meta} />}
      </QueryState>
    </div>
  );
}
