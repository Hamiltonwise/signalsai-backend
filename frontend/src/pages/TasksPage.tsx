/**
 * TasksPage — standalone /tasks route rendering the To-Do List.
 */

import { useAuth } from "../hooks/useAuth";
import { useLocationContext } from "../contexts/locationContext";
import { TasksView } from "../components/tasks/TasksView";

export default function TasksPage() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const locationId = selectedLocation?.id ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <h1 className="text-xl sm:text-2xl font-bold text-[#212D40] mb-6">
        To-Do List
      </h1>
      <TasksView
        organizationId={userProfile?.organizationId ?? null}
        locationId={locationId}
      />
    </div>
  );
}
