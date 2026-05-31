import { redirect } from 'next/navigation';

// Legacy route: /@{username} → canonical /user/{username}
export default function AtHandleRedirect({ params }: { params: { username: string } }) {
  redirect(`/user/${params.username}`);
}
