// Existing doctors created before DoctorProfile.fullName existed have no
// value there yet — falls back to their account email so display code never
// shows "Dr. null". Admins can backfill via PATCH /api/doctors/[doctorId].
export function getDoctorDisplayName(doctor: {
  fullName: string | null;
  user: { email: string };
}): string {
  return doctor.fullName ?? doctor.user.email;
}
