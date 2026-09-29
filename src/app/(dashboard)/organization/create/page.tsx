import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { CreateOrganizationForm } from '@/components/organization/create-organization-form'

export const metadata = {
  title: 'Create Organization',
}

export default async function CreateOrganizationPage() {
  const currentUser = await requireAuthUser()

  return (
    <div className="py-4 sm:py-8">
      <CreateOrganizationForm currentOrgCount={currentUser.memberships.length} />
    </div>
  )
}
