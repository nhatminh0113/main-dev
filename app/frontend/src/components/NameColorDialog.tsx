import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useDeleteLabel, useDeleteProject, useSaveLabel, useSaveProject } from '../api/hooks'
import { COLORS, type Color, type Label, type Project } from '../api/types'
import { COLOR_HEX, COLOR_NAMES } from '../lib/colors'
import { Dialog } from './Dialog'
import styles from './NameColorDialog.module.css'
import { useToast } from './Toast'

export type EditTarget =
  | { kind: 'project'; item?: Project }
  | { kind: 'label'; item?: Label }
  | null

/** Create / rename / recolour / delete a project or a label. */
export function NameColorDialog({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const title = !target
    ? ''
    : `${target.item ? 'Sửa' : 'Thêm'} ${target.kind === 'project' ? 'dự án' : 'nhãn'}`
  return (
    <Dialog open={target !== null} onClose={onClose} title={title} size="sm">
      {target && <Form key={`${target.kind}-${target.item?.id ?? 'new'}`} target={target} onClose={onClose} />}
    </Dialog>
  )
}

function Form({ target, onClose }: { target: NonNullable<EditTarget>; onClose: () => void }) {
  const isProject = target.kind === 'project'
  const [name, setName] = useState(target.item?.name ?? '')
  const [color, setColor] = useState<Color>(target.item?.color ?? (isProject ? 'indigo' : 'grey'))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const errorId = useId()
  const navigate = useNavigate()
  const toast = useToast()
  const saveProject = useSaveProject()
  const saveLabel = useSaveLabel()
  const deleteProject = useDeleteProject()
  const deleteLabel = useDeleteLabel()
  const save = isProject ? saveProject : saveLabel
  const remove = isProject ? deleteProject : deleteLabel

  const invalidLabel = !isProject && /[\s@#]/.test(name.trim())

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || invalidLabel) return
    try {
      const saved = await save.mutateAsync({ id: target.item?.id, name: name.trim(), color })
      if (!target.item) navigate(isProject ? `/project/${saved.id}` : `/label/${saved.id}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được.')
    }
  }

  async function handleDelete() {
    if (!target.item) return
    await remove.mutateAsync(target.item.id)
    toast({ message: `Đã xóa ${isProject ? 'dự án' : 'nhãn'} “${target.item.name}”` })
    navigate(isProject ? '/inbox' : '/today')
    onClose()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor={nameId} className={styles.label}>
          Tên
        </label>
        <input
          id={nameId}
          className="input"
          value={name}
          maxLength={isProject ? 120 : 60}
          data-autofocus
          aria-invalid={invalidLabel || error !== null}
          aria-describedby={error || invalidLabel ? errorId : undefined}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
      </div>

      <fieldset className={styles.colors}>
        <legend className={styles.label}>Màu</legend>
        <div className={styles.swatches}>
          {COLORS.map((c) => (
            <label key={c} className={styles.swatch} title={COLOR_NAMES[c]}>
              <input
                type="radio"
                name="color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                className="visually-hidden"
              />
              <span className={styles.dot} style={{ background: COLOR_HEX[c] }} aria-hidden="true" />
              <span className="visually-hidden">{COLOR_NAMES[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {(error || invalidLabel) && (
        <p id={errorId} role="alert" className={styles.error}>
          {invalidLabel ? 'Tên nhãn không được chứa khoảng trắng, @ hoặc #.' : error}
        </p>
      )}

      <div className={styles.footer}>
        {target.item &&
          (confirmDelete ? (
            <span className={styles.confirm}>
              {isProject ? `Xóa cả ${(target.item as Project).open_count} việc?` : 'Chắc chắn?'}
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={remove.isPending}>
                Xóa
              </button>
            </span>
          ) : (
            <button type="button" className={`btn btn-ghost ${styles.delete}`} onClick={() => setConfirmDelete(true)}>
              Xóa {isProject ? 'dự án' : 'nhãn'}
            </button>
          ))}
        <div className={styles.buttons}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!name.trim() || invalidLabel || save.isPending}
          >
            {target.item ? 'Lưu' : 'Thêm'}
          </button>
        </div>
      </div>
    </form>
  )
}
