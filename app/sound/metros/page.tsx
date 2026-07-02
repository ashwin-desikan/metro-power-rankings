import { redirect } from 'next/navigation';

// The standalone metros index duplicated /sound/rankings, so it now redirects
// there. Individual metro profiles still live at /sound/metros/[slug].
export default function MetrosIndexRedirect() {
  redirect('/sound/rankings');
}
