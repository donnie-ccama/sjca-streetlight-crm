import { gql } from 'src/logic-functions/workspace-gql';

export const createStaffTask = async (input: {
  personId: string;
  title: string;
  body: string;
}): Promise<void> => {
  const created = await gql(
    `mutation ($data: TaskCreateInput!) {
      createTask(data: $data) { id }
    }`,
    { data: { title: input.title, bodyV2: { markdown: input.body } } },
  );
  const taskId: string | undefined = created.createTask?.id;

  if (!taskId) throw new Error('createTask returned no id');

  await gql(
    `mutation ($data: TaskTargetCreateInput!) {
      createTaskTarget(data: $data) { id }
    }`,
    { data: { taskId, targetPersonId: input.personId } },
  );
};
