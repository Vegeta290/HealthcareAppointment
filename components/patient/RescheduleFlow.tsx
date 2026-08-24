"use client";

import { useCallback, useEffect, useReducer } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { formatSlotButtonLabel } from "@/lib/dateTime";

type Step = "pick-slot" | "confirm";

interface State {
  date: string;
  slots: string[];
  slotsLoading: boolean;
  selectedSlot: string | null;
  holdId: string | null;
  holdExpiresAt: string | null;
  step: Step;
  error: string | null;
  submitting: boolean;
}

type Action =
  | { type: "SET_DATE"; date: string }
  | { type: "SLOTS_LOADING" }
  | { type: "SLOTS_LOADED"; slots: string[] }
  | { type: "SLOTS_FAILED"; error: string }
  | { type: "HOLD_PENDING" }
  | { type: "HOLD_CREATED"; holdId: string; expiresAt: string; slot: string }
  | { type: "HOLD_FAILED"; error: string }
  | { type: "RESCHEDULE_PENDING" }
  | { type: "RESCHEDULE_FAILED"; error: string }
  | { type: "HOLD_EXPIRED" }
  | { type: "BACK_TO_SLOTS" };

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const initialState: State = {
  date: todayIsoDate(),
  slots: [],
  slotsLoading: false,
  selectedSlot: null,
  holdId: null,
  holdExpiresAt: null,
  step: "pick-slot",
  error: null,
  submitting: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_DATE":
      return { ...state, date: action.date, slots: [], error: null };
    case "SLOTS_LOADING":
      return { ...state, slotsLoading: true, error: null };
    case "SLOTS_LOADED":
      return { ...state, slotsLoading: false, slots: action.slots };
    case "SLOTS_FAILED":
      return { ...state, slotsLoading: false, error: action.error };
    case "HOLD_PENDING":
      return { ...state, submitting: true, error: null };
    case "HOLD_CREATED":
      return {
        ...state,
        submitting: false,
        selectedSlot: action.slot,
        holdId: action.holdId,
        holdExpiresAt: action.expiresAt,
        step: "confirm",
      };
    case "HOLD_FAILED":
      return { ...state, submitting: false, error: action.error };
    case "RESCHEDULE_PENDING":
      return { ...state, submitting: true, error: null };
    case "RESCHEDULE_FAILED":
      return { ...state, submitting: false, error: action.error };
    case "HOLD_EXPIRED":
      return {
        ...state,
        holdId: null,
        holdExpiresAt: null,
        selectedSlot: null,
        step: "pick-slot",
        error: "Your hold on that slot expired. Please pick another slot.",
      };
    case "BACK_TO_SLOTS":
      return { ...state, step: "pick-slot", holdId: null, holdExpiresAt: null, selectedSlot: null };
    default:
      return state;
  }
}

export function RescheduleFlow({ appointmentId, doctorId }: { appointmentId: string; doctorId: string }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadSlots = useCallback(
    async (date: string) => {
      dispatch({ type: "SLOTS_LOADING" });
      try {
        const res = await fetch(`/api/doctors/${doctorId}/slots?date=${date}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load slots");
        dispatch({ type: "SLOTS_LOADED", slots: data.slots });
      } catch (err) {
        dispatch({ type: "SLOTS_FAILED", error: err instanceof Error ? err.message : "Failed to load slots" });
      }
    },
    [doctorId]
  );

  useEffect(() => {
    loadSlots(state.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.date, loadSlots]);

  useEffect(() => {
    if (!state.holdExpiresAt) return;
    const msRemaining = new Date(state.holdExpiresAt).getTime() - Date.now();
    if (msRemaining <= 0) {
      dispatch({ type: "HOLD_EXPIRED" });
      return;
    }
    const timer = setTimeout(() => dispatch({ type: "HOLD_EXPIRED" }), msRemaining);
    return () => clearTimeout(timer);
  }, [state.holdExpiresAt]);

  async function handleSelectSlot(slot: string) {
    dispatch({ type: "HOLD_PENDING" });
    try {
      const res = await fetch("/api/appointments/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, slotStart: slot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to hold slot");
      dispatch({ type: "HOLD_CREATED", holdId: data.hold.id, expiresAt: data.hold.expiresAt, slot });
    } catch (err) {
      dispatch({ type: "HOLD_FAILED", error: err instanceof Error ? err.message : "Failed to hold slot" });
    }
  }

  async function handleConfirmReschedule() {
    if (!state.holdId) return;
    dispatch({ type: "RESCHEDULE_PENDING" });
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId: state.holdId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reschedule");
      router.push(`/patient/appointments/${data.appointment.id}`);
      router.refresh();
    } catch (err) {
      dispatch({
        type: "RESCHEDULE_FAILED",
        error: err instanceof Error ? err.message : "Failed to reschedule",
      });
    }
  }

  if (state.step === "confirm") {
    return (
      <Card>
        <CardBody className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              New slot: {state.selectedSlot && formatSlotButtonLabel(state.selectedSlot)}
            </p>
            <p className="text-xs text-slate-500">
              Held until {state.holdExpiresAt && new Date(state.holdExpiresAt).toLocaleTimeString()} — confirm
              before then or it will be released.
            </p>
          </div>
          {state.error && <Alert>{state.error}</Alert>}
          <div className="flex gap-2">
            <Button onClick={handleConfirmReschedule} disabled={state.submitting}>
              {state.submitting ? "Rescheduling…" : "Confirm reschedule"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => dispatch({ type: "BACK_TO_SLOTS" })}
              disabled={state.submitting}
            >
              Choose a different slot
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <Input
          type="date"
          min={todayIsoDate()}
          value={state.date}
          onChange={(e) => dispatch({ type: "SET_DATE", date: e.target.value })}
        />

        {state.error && <Alert>{state.error}</Alert>}

        {state.slotsLoading ? (
          <p className="text-sm text-slate-500">Loading available slots…</p>
        ) : state.slots.length === 0 ? (
          <p className="text-sm text-slate-500">No available slots on this date.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {state.slots.map((slot) => (
              <Button
                key={slot}
                variant="secondary"
                disabled={state.submitting}
                onClick={() => handleSelectSlot(slot)}
              >
                {formatSlotButtonLabel(slot)}
              </Button>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
